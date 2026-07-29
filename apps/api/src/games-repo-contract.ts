/**
 * Serve-time contract shared with the games repo's assembler / Check 4.
 *
 * The games repo (`tools/lib/assemble.ts`, `tools/validate.ts`) is the other
 * half of this lockstep. A stale copy here 502s every published game while
 * catalog/media still look fine (issue #247). CI re-checks the live games repo
 * when `GAMES_REPO_TOKEN` is set (`npm run contract:games-repo`).
 */

/** Canonical GameKit module order — must match games-repo `GAME_KIT_MODULES`. */
export const GAME_KIT_MODULES = [
  'input',
  'collision',
  'world',
  'ai',
  'gameplay',
  'drawing',
  'actors',
  'gfx',
  'gfx3d',
  'effects',
  'audio',
  'party',
  'save',
  'commons',
  'mascot',
] as const;

export type GameKitModuleName = (typeof GAME_KIT_MODULES)[number];

/** Author-facing budget — games-repo Check 4 `GAME_BUDGET_BYTES`. */
export const GAME_BUDGET_BYTES = 200 * 1024;

/**
 * Sum of GameKit platform allowances outside the author budget (touch, restart,
 * music, touch hint, progress, universal input, pointer poll, draw surface,
 * pointer release, host pause, mascot draw, headroom, gfx3d, look, spatial, …). Together with
 * {@link GAME_BUDGET_BYTES} this must equal games-repo `MAX_BUNDLE_BYTES`
 * (429_687, matching games-repo `shared/assemble-contract.json` `maxProjectBytes`). Not a round KiB.
 *
 * Last moved by games-repo #124 (Scene3D B11 scene management): `gfx3d`
 * 80_000 → 96_000 (+16_000, 413_687 → 429_687).
 *
 * Before that, games-repo #123 (Scene3D B10 effects): `gfx3d` 56_000 → 80_000
 * (+24_000, 389_687 → 413_687).
 *
 * Before that, games-repo #120 (Scene3D B8/B9): two new named allowances on top
 * of the B7 `gfx3d` 56_000 reserve — +4_683 (`lookControls`) and +2_977
 * (`spatialAudio`), 382_027 → 389_687.
 *
 * Before that, games-repo #117 (Scene3D B7): `gfx3d` 40_000 → 56_000 (+16_000,
 * 366_027 → 382_027) for procedural textures, point lights and bloom.
 *
 * Before that, games-repo #113 (the voxel and third-person pilots): `gfx3d`
 * 32_000 → 40_000 (+8_000, 358_027 → 366_027) for the scene3d template and the
 * chase camera those pilots share. Same opt-in shape as the band below.
 *
 * Before that, games-repo #111 (the `gfx3d` kit): +32_000 (`gfx3d`) for an
 * opt-in Lambert-mesh scene module measured at ~31.5 KiB transpiled. It is only
 * inlined when a `GAME.json` asks for it, so unlike the allowances below it is
 * not bytes every game pays — but the cap is a single number, and a gfx3d game
 * that clears Check 4 over there has to assemble here to be playable at all.
 * That is the same shape as the touch-layer drift that put block-cascade and
 * rooftop-dash live answering 422.
 *
 * Before that, games-repo #102: +679 (`mascotDraw`) and +75_237 (`headroom`) — 30% of
 * the 250_790 ceiling — plus earlier host-pause / touch steer raises.
 */
export const GAMEKIT_PLATFORM_BYTES = 224_887;

/** Combined html+js+css size cap — must match games-repo `MAX_BUNDLE_BYTES`. */
export const MAX_PROJECT_BYTES = GAME_BUDGET_BYTES + GAMEKIT_PLATFORM_BYTES;

/**
 * Music embedding contract (games-repo `tools/lib/assemble.ts`):
 * - `GAME.json` → `audio.music` is a single track-name string
 * - catalog is loaded via `readMusicCatalog()` (games-repo `tools/audio.ts`;
 *   formerly an inline `shared/audio/music.json` read in assemble.ts)
 * - inject `window.__GAME_AUDIO_MUSIC__ = "<name>"` and a one-entry tracks object
 */
export const MUSIC_CONTRACT = {
  manifestField: 'music',
  manifestFieldType: 'string',
  /** Historical path; the catalog file may still live here inside `tools/audio.ts`. */
  catalogPath: 'shared/audio/music.json',
  /** Function assemble.ts calls to load the music catalog (post-refactor lockstep). */
  catalogReader: 'readMusicCatalog',
  catalogTracksKey: 'tracks',
  windowMusicName: '__GAME_AUDIO_MUSIC__',
  windowTracksName: '__GAME_MUSIC_TRACKS__',
} as const;

/** Pull the `GAME_KIT_MODULES = [ ... ]` array literal out of games-repo assemble source. */
export function extractGameKitModules(assembleSource: string): string[] {
  const match = assembleSource.match(/GAME_KIT_MODULES\s*=\s*\[([\s\S]*?)\]/);
  if (!match) {
    throw new Error('games-repo assemble source has no GAME_KIT_MODULES array');
  }
  const modules = [...match[1].matchAll(/['"]([a-z0-9-]+)['"]/g)].map((entry) => entry[1]);
  if (modules.length === 0) {
    throw new Error('games-repo GAME_KIT_MODULES array is empty');
  }
  return modules;
}

/**
 * Resolve `MAX_BUNDLE_BYTES = <expr>` from games-repo validate source, substituting
 * simple `const NAME = number | number * number` definitions from the same file.
 */
export function extractMaxBundleBytes(validateSource: string): number {
  const assign = validateSource.match(/MAX_BUNDLE_BYTES\s*=\s*([^;]+);/);
  if (!assign) {
    throw new Error('games-repo validate source has no MAX_BUNDLE_BYTES assignment');
  }
  return evaluateByteExpression(assign[1], validateSource);
}

/** Confirm games-repo assemble still implements the music injection contract. */
export function extractMusicContractSignals(assembleSource: string): {
  injectsMusicName: boolean;
  readsTracksKey: boolean;
  readsMusicCatalog: boolean;
} {
  // Escape so `shared/audio/music.json` is matched literally — a bare `/music\.json/`
  // would also accept comments or unrelated filenames (Copilot review on #272).
  const catalogPathPattern = MUSIC_CONTRACT.catalogPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    injectsMusicName: new RegExp(`${MUSIC_CONTRACT.windowMusicName}\\s*=`).test(assembleSource),
    readsTracksKey: new RegExp(`\\b${MUSIC_CONTRACT.catalogTracksKey}\\b`).test(assembleSource),
    // Prefer the post-refactor reader; keep the historical catalog path as a
    // fallback so an older games-repo tip still clears the check during a
    // staggered rollout.
    readsMusicCatalog:
      new RegExp(`\\b${MUSIC_CONTRACT.catalogReader}\\s*\\(`).test(assembleSource) ||
      new RegExp(catalogPathPattern).test(assembleSource),
  };
}

function evaluateByteExpression(expression: string, source: string): number {
  const rawDefs = [...source.matchAll(/(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=\s*([^;]+);/g)].map((match) => [
    match[1],
    match[2].trim(),
  ]) as Array<[string, string]>;

  // Resolve consts iteratively so `MAX = BUDGET + TOUCH + …` works when the
  // addends are themselves `200 * 1024` / `7_501` style definitions.
  const definitions = new Map<string, number>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const [name, rhs] of rawDefs) {
      if (definitions.has(name)) continue;
      const value = tryEvalArithmetic(rhs, definitions);
      if (value !== null) {
        definitions.set(name, value);
        progress = true;
      }
    }
  }

  const result = tryEvalArithmetic(expression.trim(), definitions);
  if (result === null || result <= 0) {
    throw new Error(`cannot evaluate games-repo budget expression: ${expression.trim()}`);
  }
  return result;
}

function tryEvalArithmetic(expression: string, definitions: Map<string, number>): number | null {
  // Substitute longest names first so GAMEKIT_TOUCH_BYTES does not clobber
  // GAMEKIT_TOUCH_HINT_BYTES, then strip numeric separators (7_501 → 7501).
  let replaced = expression;
  const namesLongestFirst = [...definitions.keys()].sort((a, b) => b.length - a.length);
  for (const name of namesLongestFirst) {
    replaced = replaced.replace(new RegExp(`\\b${name}\\b`, 'g'), String(definitions.get(name)));
  }
  while (/(\d)_(\d)/.test(replaced)) {
    replaced = replaced.replace(/(\d)_(\d)/g, '$1$2');
  }
  if (!/^[\d\s*+\-()/]+$/.test(replaced)) {
    return null;
  }
  const result = Function(`"use strict"; return (${replaced});`)() as number;
  return Number.isFinite(result) ? result : null;
}
