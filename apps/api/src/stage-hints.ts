/**
 * Advisory checks run at stage_source_file / patch_source_file time.
 *
 * submit_sources typechecks and validates the audio catalog once, against the whole
 * delivery (typecheck-preflight.ts, games-repo-contract.ts music validation). An agent
 * that guesses a bad property name or an invented music track only learns that after a
 * full stage → submit → gate-rejection → refix round trip. Both checks below already
 * exist for submit; this module reuses them per staged/patched file so the same mistake
 * surfaces immediately, as a non-blocking hint — never a 400, never round state.
 *
 * Best-effort throughout: any failure to load the kit or read staged sources is
 * swallowed and yields no hint, matching the existing `gameManifestHint`/
 * `largeSourceFileHint` advisory pattern used by the same endpoints.
 */

import type { KitFileStore } from './kit-files.js';
import type { GamesStore } from './games-store.js';
import { runTypecheckPreflight, sharedSourcesFromKitTree } from './typecheck-preflight.js';
import { KIT_ROOT_DIR } from './kit-registry.js';
import {
  mergeMusicTrackMaps,
  parseGameMusicTracks,
  parseMusicCatalogTracks,
  type MusicTracksMap,
} from './music-tracks.js';

// Stage-time budget is tighter than submit's — this runs on a hot single-file endpoint,
// possibly several times per round, not once at delivery.
const STAGE_TYPECHECK_BUDGET_MS = 4_000;

export type StageAdvisories = {
  typecheckHint?: string;
  audioHint?: string;
};

export async function computeStageAdvisories(input: {
  kitFileStore: KitFileStore | null;
  gamesStore: GamesStore;
  slug: string;
  issueNumber: number;
  roundGeneration: number;
  engineRef: string | undefined;
  path: string;
  content: string;
}): Promise<StageAdvisories> {
  const result: StageAdvisories = {};
  const normalized = input.path.trim().replaceAll('\\', '/');
  const isTs = normalized.endsWith('.ts') || normalized.endsWith('.tsx');
  const isGameJson = normalized === 'GAME.json';
  if (!input.kitFileStore || !input.engineRef || (!isTs && !isGameJson)) {
    return result;
  }

  const tree = await input.kitFileStore.loadTree(input.engineRef).catch(() => null);
  if (!tree) return result;

  if (isTs) {
    try {
      const staged = await input.gamesStore.getStagedSourceFiles({
        slug: input.slug,
        issueNumber: input.issueNumber,
        roundGeneration: input.roundGeneration,
      });
      const sources: Record<string, string> = {};
      for (const file of staged) {
        if (!('deleted' in file) || !file.deleted) sources[file.path] = file.content;
      }
      // The staged read can race the write it follows — never trust it over the file
      // this call just wrote.
      sources[normalized] = input.content;
      const check = await runTypecheckPreflight({
        slug: input.slug,
        sources,
        kitShared: sharedSourcesFromKitTree(tree),
        budgetMs: STAGE_TYPECHECK_BUDGET_MS,
      });
      if (!check.ok) result.typecheckHint = check.message;
    } catch {
      // best-effort — never block staging on this
    }
  }

  if (isGameJson) {
    try {
      const hint = await audioCatalogHint({
        tree,
        gamesStore: input.gamesStore,
        slug: input.slug,
        issueNumber: input.issueNumber,
        roundGeneration: input.roundGeneration,
        content: input.content,
      });
      if (hint) result.audioHint = hint;
    } catch {
      // best-effort
    }
  }

  return result;
}

async function audioCatalogHint(input: {
  tree: { files: Map<string, Buffer> };
  gamesStore: GamesStore;
  slug: string;
  issueNumber: number;
  roundGeneration: number;
  content: string;
}): Promise<string | null> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(input.content);
  } catch {
    return null; // gameManifestHint already reports invalid JSON
  }
  if (typeof manifest !== 'object' || manifest === null) return null;
  const audio = (manifest as Record<string, unknown>).audio;
  if (typeof audio !== 'object' || audio === null || Array.isArray(audio)) return null;
  const music = (audio as Record<string, unknown>).music;
  const rawTracks = (audio as Record<string, unknown>).musicTracks;
  const musicTracks = Array.isArray(rawTracks) ? rawTracks.filter((t): t is string => typeof t === 'string') : [];
  const wanted = [music, ...musicTracks].filter((t): t is string => typeof t === 'string' && t.length > 0);
  if (wanted.length === 0) return null;

  const catalogEntry = input.tree.files.get(`${KIT_ROOT_DIR}/shared/audio/music.json`);
  if (!catalogEntry) return null;
  let catalog: MusicTracksMap;
  try {
    catalog = parseMusicCatalogTracks(catalogEntry.toString('utf8'));
  } catch {
    return null;
  }

  let gameTracks: MusicTracksMap | null = null;
  try {
    const gameMusicJson = await input.gamesStore.getStagedSourceFile({
      slug: input.slug,
      issueNumber: input.issueNumber,
      roundGeneration: input.roundGeneration,
      path: 'music.json',
    });
    if (gameMusicJson) gameTracks = parseGameMusicTracks(gameMusicJson);
  } catch {
    // An invalid staged music.json is its own problem; do not let it block this hint.
    return null;
  }

  let merged: MusicTracksMap;
  try {
    merged = mergeMusicTrackMaps(catalog, gameTracks);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  const unknown = wanted.find((name) => !Object.hasOwn(merged, name));
  if (!unknown) return null;
  return (
    `${input.slug} selects unknown music track "${unknown}" — this is the same check the preview gate's smoke ` +
    `stage runs, so submit_sources will fail with this exact error. Valid ids: ${Object.keys(merged).sort().join(', ')}` +
    (gameTracks
      ? ''
      : ", or add it to a staged music.json (get_kit_api's Audio catalog section lists the shared ones).")
  );
}
