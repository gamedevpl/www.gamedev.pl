import { isPublishedEntry, type CatalogEntry } from '@gamedevpl/contract';
import { classifyTouchSource } from './catalog-touch.js';
import {
  countArtifactRichness,
  countCodeLines,
  isGameLocPath,
  normalizeEffort,
  type EffortInputs,
} from './catalog-effort.js';

export type CatalogEntryFromSpec = (
  slug: string,
  specMd: string,
  readSibling: (name: string) => string | null,
) => CatalogEntry | null;

export interface BuildCatalogFromArchiveOptions {
  entryFromSpec: CatalogEntryFromSpec;
  commitCounts?: ReadonlyMap<string, number>;
}

export async function buildCatalogFromArchive(
  ref: string,
  readRawFile: (path: string, ref: string) => Promise<string | null>,
  paths: readonly string[],
  options: BuildCatalogFromArchiveOptions,
): Promise<CatalogEntry[]> {
  const pathSet = new Set(paths);
  const slugs = new Set<string>();
  const tsPathsBySlug = new Map<string, string[]>();
  const mediaPngBySlug = new Map<string, number>();
  for (const filePath of paths) {
    const match = /^games\/([a-z0-9][a-z0-9-]*)\/(.+)$/.exec(filePath);
    if (!match) continue;
    const slug = match[1];
    const relative = match[2];
    if (relative === 'SPEC.md') slugs.add(slug);
    if (relative.endsWith('.ts')) {
      const list = tsPathsBySlug.get(slug);
      if (list) list.push(filePath);
      else tsPathsBySlug.set(slug, [filePath]);
    }
    if (relative.startsWith('media/') && relative.endsWith('.png') && !relative.slice('media/'.length).includes('/')) {
      mediaPngBySlug.set(slug, (mediaPngBySlug.get(slug) ?? 0) + 1);
    }
  }

  const entries: CatalogEntry[] = [];
  const inputs = new Map<string, EffortInputs>();
  for (const slug of [...slugs].sort()) {
    const specMd = await readRawFile(`games/${slug}/SPEC.md`, ref);
    if (specMd === null) continue;

    const mediaPath = `games/${slug}/media/metadata.json`;
    const mediaJson = pathSet.has(mediaPath) ? await readRawFile(mediaPath, ref) : null;
    const entry = options.entryFromSpec(slug, specMd, (name) => (name === 'media/metadata.json' ? mediaJson : null));
    if (!entry) continue;

    if (entry.media) {
      const screenshots = entry.media.screenshots.filter((shot) => pathSet.has(`games/${slug}/media/${shot.file}`));
      const video =
        entry.media.video && pathSet.has(`games/${slug}/media/${entry.media.video}`) ? entry.media.video : null;
      entry.media = screenshots.length > 0 || video ? { screenshots, video } : null;
    }

    const tsPaths = tsPathsBySlug.get(slug) ?? [];
    const sources = await Promise.all(tsPaths.map((filePath) => readRawFile(filePath, ref)));
    entry.touch = classifyTouchSource(sources.filter((text): text is string => text !== null).join('\n'));

    if (isPublishedEntry(entry)) {
      const locSources: string[] = [];
      for (const [index, filePath] of tsPaths.entries()) {
        const relative = filePath.slice(`games/${slug}/`.length);
        const text = sources[index];
        if (text !== null && isGameLocPath(relative)) locSources.push(text);
      }

      const [trace, acceptance, playtest] = await Promise.all([
        pathSet.has(`games/${slug}/TRACE.json`) ? readRawFile(`games/${slug}/TRACE.json`, ref) : null,
        pathSet.has(`games/${slug}/ACCEPTANCE.json`) ? readRawFile(`games/${slug}/ACCEPTANCE.json`, ref) : null,
        pathSet.has(`games/${slug}/PLAYTEST.json`) ? readRawFile(`games/${slug}/PLAYTEST.json`, ref) : null,
      ]);

      inputs.set(slug, {
        loc: countCodeLines(locSources),
        artifacts: countArtifactRichness({
          trace,
          acceptance,
          playtest,
          mediaPngCount: mediaPngBySlug.get(slug) ?? 0,
        }),
        commits: options.commitCounts?.get(slug) ?? 0,
      });
    }

    entries.push(entry);
  }

  const scores = normalizeEffort(inputs);
  for (const entry of entries) {
    const effort = scores.get(entry.slug);
    if (effort !== undefined) entry.effort = effort;
  }
  return entries;
}
