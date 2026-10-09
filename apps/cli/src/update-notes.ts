import { stripVTControlCharacters } from 'node:util';
import wrapAnsi from 'wrap-ansi';
import { compareSemver, type FetchLike } from './update.js';

type Change = { category: 'Breaking' | 'Added' | 'Fixed'; text: string };
export type ReleaseChanges = { version: string; changes: Change[] };
export type UpdateNotes = {
  previousVersion: string;
  scope: 'upgrade' | 'release';
  status: 'available' | 'unavailable' | 'unchanged';
  releases: ReleaseChanges[];
  url: string;
};

const stableVersion = /^\d+\.\d+\.\d+$/;
const changelogPath = 'apps/cli/CHANGELOG.md';
const repository = 'gamedevpl/www.gamedev.pl';
const clean = (text: string) =>
  stripVTControlCharacters(text)
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/`/g, '')
    .trim();

export function parseUpdateNotes(text: string, previousVersion: string, version: string): ReleaseChanges[] {
  const upgrading = stableVersion.test(previousVersion) && compareSemver(version, previousVersion) > 0;
  const releases: ReleaseChanges[] = [];
  let release: ReleaseChanges | null = null;
  let category: Change['category'] | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      const match = /^## (\d+\.\d+\.\d+)(?:\s+[—-]\s+\d{4}-\d{2}-\d{2})?\s*$/.exec(line);
      const candidate = match?.[1];
      const wanted =
        candidate &&
        (upgrading
          ? compareSemver(candidate, previousVersion) > 0 && compareSemver(candidate, version) <= 0
          : candidate === version);
      release = wanted ? { version: candidate!, changes: [] } : null;
      if (release) releases.push(release);
      category = null;
    } else if (line.startsWith('### ')) {
      category = (/^### (Breaking|Added|Fixed)\s*$/.exec(line)?.[1] as Change['category']) ?? null;
    } else if (release && category && line.startsWith('- ')) {
      release.changes.push({ category, text: clean(line.slice(2)) });
    } else if (release && category && /^\s+\S/.test(line)) {
      const last = release.changes.at(-1);
      if (last) last.text += ` ${clean(line)}`;
    }
  }
  return releases.sort((a, b) => compareSemver(b.version, a.version));
}

export async function fetchUpdateNotes(input: {
  previousVersion: string;
  version: string;
  fetchImpl?: FetchLike;
}): Promise<UpdateNotes> {
  const { previousVersion, version } = input;
  const tag = `cli-v${encodeURIComponent(version)}`;
  const notes: UpdateNotes = {
    previousVersion,
    scope: stableVersion.test(previousVersion) && compareSemver(version, previousVersion) > 0 ? 'upgrade' : 'release',
    status: version === previousVersion ? 'unchanged' : 'unavailable',
    releases: [],
    url: `https://github.com/${repository}/blob/${tag}/${changelogPath}`,
  };
  if (notes.status === 'unchanged' || !stableVersion.test(version)) return notes;
  try {
    const response = await (input.fetchImpl ?? fetch)(
      `https://raw.githubusercontent.com/${repository}/${tag}/${changelogPath}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!response.ok) return notes;
    const text = await response.text();
    if (text.length > 200_000) return notes;
    const releases = parseUpdateNotes(text, previousVersion, version);
    if (releases.some((release) => release.version === version)) {
      notes.status = 'available';
      notes.releases = releases.filter((release) => release.changes.length > 0);
    }
  } catch {
    // Release notes must never turn a successful installation into failure.
  }
  return notes;
}

export function formatUpdateNotes(notes: UpdateNotes, columns = 80): string {
  if (notes.status === 'unchanged') return 'No version change.';
  if (notes.status === 'unavailable') return `Release notes unavailable. Changelog: ${notes.url}`;
  const lines = [notes.scope === 'upgrade' ? "What's new:" : 'Changes in this release:'];
  for (const release of notes.releases) {
    lines.push('', release.version);
    for (const change of release.changes) lines.push(`  - ${change.category}: ${change.text}`);
  }
  if (notes.releases.length === 0) lines.push('No creator-facing changes listed.');
  const width = Math.max(20, Math.min(100, columns));
  return `${wrapAnsi(lines.join('\n'), width, { hard: true })}\n\nChangelog: ${notes.url}`;
}
