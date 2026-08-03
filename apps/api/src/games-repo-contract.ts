/**
 * Serve-time contract shared with the games repo's assembler / Check 4.
 *
 * The games repo (`tools/lib/assemble.ts`, `tools/validate.ts`) is the other
 * half of this lockstep. A stale copy here 502s every published game while
 * catalog/media still look fine (issue #247). CI re-checks the live games repo
 * when `GAMES_REPO_TOKEN` is set (`npm run contract:games-repo`).
 *
 * **Raising a budget? Merge this side first.** The two PRs are not order-neutral.
 * Games-repo-first opens a window where the build ceiling is above the serve one,
 * and a game that grows into it bakes as a failure — quietly, because a partial
 * bake leaves the pointer on the previous snapshot, so the site keeps serving and
 * merged games simply never appear. Website-first cannot do that: a serve cap above
 * the build cap means no assemblable game is refused here. See
 * docs/games-repo-validation-spec.md §2.
 *
 * **Adding a GameKit module? Same order.** The live `contract:games-repo` check
 * allows this side to list modules the published games tip has not shipped yet
 * (website-ahead extras), and fails only when games-repo introduces a name or
 * reorders shared modules this side does not recognize.
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
  // Genre vertical: the GitHub client bundles its private shared/verticals/racing graph.
  'racing',
  'effects',
  'audio',
  'party',
  'save',
  'commons',
  'presence',
  'mascot',
  // P3's zone module (docs/persistent-world-plan.md). Opt-in, and since games-repo #163
  // it has a reserve of its own rather than coming out of the author budget — see the
  // note on GAMEKIT_PLATFORM_BYTES for what changed that.
  'zone',
  // Device tilt as a normalized stick (games-repo docs/camera-ar-platform.md Phase 0).
  // Opt-in with a small reserve; the shell half is apps/web/src/sensing.ts. Ordered
  // before `voice` deliberately: sensing merges into games-repo first (appended after
  // `zone` there), so this order lets voice land as a clean append rather than a
  // reorder the contract check would refuse.
  'sensing',
  // Voice loudness meter (games-repo voice-on-phones Layer 0). Opt-in reserve like zone.
  'voice',
  // Studio-editable content (EditorKit L2, games-repo Check 31). Opt-in, receive-only
  // bridge module; the Studio pushes drafts, the game re-enters play. Appended last.
  'editor',
] as const;

export type GameKitModuleName = (typeof GAME_KIT_MODULES)[number];

/** Author-facing budget — games-repo Check 4 `GAME_BUDGET_BYTES`. */
export const GAME_BUDGET_BYTES = 200 * 1024;

/**
 * Platform half of the serve cap — games-repo `GAMEKIT_PLATFORM_BYTES` /
 * `assemble-contract.json` `platformCeilingBytes`. Together with
 * {@link GAME_BUDGET_BYTES} this must equal games-repo `MAX_BUNDLE_BYTES`
 * (486_387, matching `maxProjectBytes`). Not a round KiB.
 *
 * One derived ceiling, not a sum of per-feature constants (games-repo #281). Check 4
 * over there bills each author for measured `assembled − platformBytes` against the
 * 200 KiB author budget; this number is serve-compat only so a game that clears that
 * gate is not refused here. Feature-by-feature archaeology lives in the games repo's
 * `docs/platform-byte-ledger.md`. Raise this when measurement shows a passing game
 * would exceed it — do not re-split it into named allowances on this side either.
 *
 * Last moved by the opt-in `editor` module (EditorKit L2): +3_700 measured,
 * 482_687 → 486_387. Before it, sensing Phase 2 (camera backdrop) raised the sensing
 * ledger line 6_500 → 9_000 (+2_500), 480_187 → 482_687.
 */
export const GAMEKIT_PLATFORM_BYTES = 281_587;

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
