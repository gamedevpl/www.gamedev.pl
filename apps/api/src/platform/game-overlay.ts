// Newest-wins source overlay a preview, typecheck or assembly renders from.

// Shape and readiness rules only, never the rendering.

import { hasPlayableHowToPlay } from './how-to-play.js';
import { resolveRoundBaseVersion, type BaseVersionRecord, type BaseVersionStore } from './round-base-version.js';
import type { GamesStore, SourceFile } from '../delivery/games-store.js';

// Overlay layers, newest-wins. Absent layers are not passed.
export type OverlayLayers = {
  // The round's staging buffer — what the agent is writing right now.
  staged?: Array<SourceFile & { deleted?: true }>;
  // The last delivered version, so a one-file tweak still renders.
  delivered?: SourceFile[];
  // The generated round-0 draft, until the agent replaces it.
  seed?: SourceFile[];
};

// Flattens the layers: staged beats delivered beats seed.
export function overlayGameSources(layers: OverlayLayers): Record<string, string> {
  const overlay: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const layer of [layers.seed, layers.delivered]) {
    for (const file of layer ?? []) overlay[file.path] = file.content;
  }
  for (const file of layers.staged ?? []) {
    if (file.deleted) delete overlay[file.path];
    else overlay[file.path] = file.content;
  }
  return overlay;
}

// The delivered sources a round improves, from its base version.

// Same base the channel's GET /sources reads.
export async function readDeliveredSources(input: {
  gamesStore: Pick<GamesStore, 'getManifest' | 'getSourceFile'>;
  store: BaseVersionStore;
  record: BaseVersionRecord & { slug?: string };
}): Promise<SourceFile[]> {
  const { gamesStore, store, record } = input;
  const slug = record.slug;
  if (!slug) return [];
  const version = await resolveRoundBaseVersion(store, record, slug);
  if (!version) return [];

  const manifest = await gamesStore.getManifest(slug, version);
  if (!manifest) return [];
  const files = await Promise.all(
    manifest.sourceFiles.map(async (path) => ({
      path,
      content: await gamesStore.getSourceFile(slug, version!, path),
    })),
  );
  // A hole is not fatal: the staged layer may supply it.
  return files.filter((file): file is SourceFile => file.content !== null);
}

// True when the overlay carries everything an assembly needs.
export function hasPlayableOverlay(overlay: Record<string, string>): boolean {
  // trim(), matching getGameSources: a whitespace-only file is absent, not staged.
  const staged = (path: string): boolean => typeof overlay[path] === 'string' && overlay[path].trim().length > 0;
  if (!staged('game.ts') || !staged('GAME.json')) return false;
  // Neither means half-staged: a quiet no.
  if (!staged('index.html') && !manifestDeclaresHowToPlay(overlay['GAME.json'])) return false;
  // The assembler derives CSS from GAME.json themes; else require style.css.
  return staged('style.css') || manifestDeclaresTheme(overlay['GAME.json']);
}

function manifestDeclaresHowToPlay(source: string | undefined): boolean {
  if (typeof source !== 'string') return false;
  try {
    const manifest = JSON.parse(source) as { howToPlay?: unknown };
    return hasPlayableHowToPlay(manifest.howToPlay);
  } catch {
    // Mid-write manifests are invalid JSON
    return false;
  }
}

function manifestDeclaresTheme(source: string | undefined): boolean {
  if (typeof source !== 'string') return false;
  try {
    const manifest = JSON.parse(source) as { theme?: unknown };
    return typeof manifest.theme === 'object' && manifest.theme !== null;
  } catch {
    return false;
  }
}
