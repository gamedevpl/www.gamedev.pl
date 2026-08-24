// Runs submit_sources' typecheck/audio checks per staged file, as hints.
import type { KitFileStore } from '../agent-surface/kit-files.js';
import type { GamesStore } from './games-store.js';
import type { BaseVersionRecord, BaseVersionStore } from '../platform/round-base-version.js';
import { overlayGameSources, readDeliveredSources } from './staged-preview.js';
import { runTypecheckPreflight, sharedSourcesFromKitTree } from '../creation/typecheck-preflight.js';
import { KIT_ROOT_DIR } from '../platform/kit-registry.js';
import {
  mergeMusicTrackMaps,
  parseGameMusicTracks,
  parseMusicCatalogTracks,
  type MusicTracksMap,
} from '../catalog/music-tracks.js';

// Tighter than submit's budget — hot endpoint, runs several times a round.
const STAGE_TYPECHECK_BUDGET_MS = 4_000;
// Bounds sync tsc cost — the budget above only checks after it runs.
const STAGE_TYPECHECK_MAX_SOURCE_BYTES = 300_000;

export type StageAdvisories = {
  typecheckHint?: string;
  audioHint?: string;
};

export async function computeStageAdvisories(input: {
  kitFileStore: KitFileStore | null;
  gamesStore: GamesStore;
  store: BaseVersionStore;
  record: BaseVersionRecord & {
    slug?: string;
    seed?: { files: { path: string; content: string }[] };
  };
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

  // Same overlay submit_sources uses — one file's edit must not flag siblings.
  const overlay = await buildOverlay(input);
  overlay[normalized] = input.content;

  if (isTs) {
    try {
      const sources: Record<string, string> = {};
      let sourceBytes = 0;
      for (const [path, content] of Object.entries(overlay)) {
        if (!path.endsWith('.ts') && !path.endsWith('.tsx')) continue;
        sources[path] = content;
        sourceBytes += Buffer.byteLength(content, 'utf8');
      }
      if (sourceBytes <= STAGE_TYPECHECK_MAX_SOURCE_BYTES) {
        const check = await runTypecheckPreflight({
          slug: input.slug,
          sources,
          kitShared: sharedSourcesFromKitTree(tree),
          budgetMs: STAGE_TYPECHECK_BUDGET_MS,
        });
        if (!check.ok) result.typecheckHint = check.message;
      }
    } catch {
      // best-effort — never block staging on this
    }
  }

  if (isGameJson) {
    try {
      const hint = audioCatalogHint({
        tree,
        slug: input.slug,
        content: input.content,
        gameMusicJson: overlay['music.json'] ?? null,
      });
      if (hint) result.audioHint = hint;
    } catch {
      // best-effort
    }
  }

  return result;
}

async function buildOverlay(input: {
  gamesStore: GamesStore;
  store: BaseVersionStore;
  record: BaseVersionRecord & {
    slug?: string;
    seed?: { files: { path: string; content: string }[] };
  };
  slug: string;
  issueNumber: number;
  roundGeneration: number;
}): Promise<Record<string, string>> {
  const staged = await input.gamesStore.getStagedSourceFiles({
    slug: input.slug,
    issueNumber: input.issueNumber,
    roundGeneration: input.roundGeneration,
  });
  const delivered = await readDeliveredSources({
    gamesStore: input.gamesStore,
    store: input.store,
    record: input.record,
  });
  return overlayGameSources({
    staged,
    delivered,
    ...(input.record.seed?.files ? { seed: input.record.seed.files } : {}),
  });
}

function audioCatalogHint(input: {
  tree: { files: Map<string, Buffer> };
  slug: string;
  content: string;
  gameMusicJson: string | null;
}): string | null {
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
  if (input.gameMusicJson) {
    try {
      gameTracks = parseGameMusicTracks(input.gameMusicJson);
    } catch {
      // Invalid staged/delivered music.json is separate — do not block on it.
      return null;
    }
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
