// Runs submit_sources' typecheck/audio checks per staged file, as hints.
import type { KitFileStore, KitTree } from '../agent-surface/kit-files.js';
import type { GamesStore } from './games-store.js';
import type { BaseVersionRecord, BaseVersionStore } from '../platform/round-base-version.js';
import { overlayGameSources, readDeliveredSources } from '../platform/game-overlay.js';
import { defineGamePreflight } from './define-game-preflight.js';
import { audioCatalogHint } from './stage-audio-hint.js';

// Tighter than submit's budget — hot endpoint, runs several times a round.
const STAGE_TYPECHECK_BUDGET_MS = 4_000;
// Bounds sync tsc cost — the budget above only checks after it runs.
const STAGE_TYPECHECK_MAX_SOURCE_BYTES = 300_000;

export type StageAdvisories = {
  typecheckHint?: string;
  audioHint?: string;
};

// What one staged file needs checking, minus the injected preflight pair.
export type StageAdvisoriesSubject = {
  kitFileStore: KitFileStore | null;
  gamesStore: GamesStore;
  store: BaseVersionStore;
  record: BaseVersionRecord & {
    slug?: string;
    seed?: { files: { path: string; content: string }[] };
  };
  slug: string;
  jobId: number;
  roundGeneration: number;
  engineRef: string | undefined;
  path: string;
  content: string;
};

export type StageAdvisoriesInput = StageAdvisoriesSubject & {
  // N1: injected so this module has no value-level creation/ import.
  runTypecheckPreflight?: (opts: {
    slug: string;
    sources: Record<string, string>;
    kitShared: Record<string, string>;
    budgetMs?: number;
  }) => Promise<{ ok: boolean; message?: string }>;
  sharedSourcesFromKitTree?: (tree: KitTree) => Record<string, string>;
};

export async function computeStageAdvisories(input: StageAdvisoriesInput): Promise<StageAdvisories> {
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
  if (overlay['GAME.json']) {
    result.typecheckHint =
      defineGamePreflight(Object.entries(overlay).map(([path, content]) => ({ path, content }))) ?? undefined;
  }

  if (isTs && input.runTypecheckPreflight && input.sharedSourcesFromKitTree) {
    try {
      const sources: Record<string, string> = {};
      let sourceBytes = 0;
      for (const [path, content] of Object.entries(overlay)) {
        if (!path.endsWith('.ts') && !path.endsWith('.tsx')) continue;
        sources[path] = content;
        sourceBytes += Buffer.byteLength(content, 'utf8');
      }
      if (sourceBytes <= STAGE_TYPECHECK_MAX_SOURCE_BYTES) {
        const check = await input.runTypecheckPreflight({
          slug: input.slug,
          sources,
          kitShared: input.sharedSourcesFromKitTree(tree),
          budgetMs: STAGE_TYPECHECK_BUDGET_MS,
        });
        if (!check.ok) result.typecheckHint = [result.typecheckHint, check.message].filter(Boolean).join('\n');
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
  jobId: number;
  roundGeneration: number;
}): Promise<Record<string, string>> {
  const staged = await input.gamesStore.getStagedSourceFiles({
    slug: input.slug,
    jobId: input.jobId,
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
