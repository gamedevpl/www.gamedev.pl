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
 *
 * ---
 *
 * The second half of this file is the **delivery** contract — which files a game may
 * upload — cut from the same games-repo file `tools/submit.mjs` reads
 * ({@link DELIVERY_CONTRACT_PATH}). It used to be a hand-kept literal on each side and
 * drifted three times (TRACE, then PLAYTEST, then AGENT); each drift turned a finished
 * game into a multi-delivery retry loop, because the site refused a path the games repo
 * had just made mandatory.
 *
 * **Adding a deliverable file? Merge this side first — the same order as raising a byte
 * budget, for the same underlying reason:** the side that *accepts* has to widen before
 * the side that *sends*. A site that allows a path no game delivers yet is inert; a game
 * that delivers a path the site refuses gets a 400 at upload, and the agent that could
 * have fixed it is gone twenty minutes later. Removing a file is the mirror image —
 * games-repo stops sending it first, this side drops the entry last — so the rule in both
 * directions is that the allowlist here is never the narrower of the two.
 */

/** Canonical GameKit module order — must match games-repo `GAME_KIT_MODULES`. */
export const GAME_KIT_MODULES = [
  'input',
  'collision',
  'world',
  // Tile/cell grid helpers (games-repo tip). Genre-agnostic, like path/collision.
  'grid',
  'path',
  'ai',
  'gameplay',
  'rng',
  'cards',
  // Top-down arcade vehicle paint/lights — pairs with gameplay.driveArcadeVehicle.
  'vehicles',
  // Genre vertical: deterministic street topology and routing for 2D urban games.
  'urban',
  'drawing',
  'actors',
  'gfx',
  // Shared interaction primitives (games-repo #682).
  'ui',
  'gfx3d',
  // Genre verticals: the GitHub client bundles their private shared/verticals graphs.
  'racing',
  'football',
  // Genre vertical: platformer physics/levels/recipes (games-repo #690, website-first).
  'platformer',
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
  // bridge module; the Studio pushes drafts, the game re-enters play.
  'editor',
  // Studio scene inspection; the shell owns the inspector UI.
  'inspect',
] as const;

export type GameKitModuleName = (typeof GAME_KIT_MODULES)[number];

/**
 * Author-facing budget — games-repo Check 4 `GAME_BUDGET_BYTES`.
 *
 * 252 → 624 KiB: transport-tycoon-remake assembled to 694_419 bytes, ~26 KiB
 * over the prior 668_048 cap.
 */
export const GAME_BUDGET_BYTES = 936 * 1024;

/**
 * Raw TypeScript source-graph ceiling for the bake/play/seed bundlers
 * (`MAX_SOURCE_GRAPH_BYTES` in `github-client.ts`, `MAX_GAME_SOURCE_BYTES` in
 * `seed-bundle.ts`). Lockstep with games-repo Check 4 `SOURCE_GRAPH_BUDGET_BYTES`.
 *
 * Distinct from {@link GAME_BUDGET_BYTES}: the assembled author payload can stay
 * under the author budget while comments and types push the `.ts` tree higher. Moved
 * 200 → 300 KiB when carjack-city (~247 KiB source) stranded every snapshot publish;
 * 300 → 336 KiB for the same game's island coastline, on-foot car collision and
 * mission-ladder work. 336 → 708 KiB to stay above the 624 KiB author budget.
 */
export const SOURCE_GRAPH_BUDGET_BYTES = 1062 * 1024;

/**
 * Raw TypeScript source-graph module ceiling for the bake/play/seed bundlers
 * (`MAX_SOURCE_GRAPH_MODULES` in `github-client.ts`, `MAX_GAME_MODULES` in
 * `seed-bundle.ts`). Raised 64 → 128 for mexico-86.
 */
export const MAX_SOURCE_GRAPH_MODULES = 128;

/**
 * Platform half of the serve cap — games-repo `GAMEKIT_PLATFORM_BYTES` /
 * `assemble-contract.json` `platformCeilingBytes`. Together with
 * {@link GAME_BUDGET_BYTES} and {@link RASTER_ASSET_BUDGET_BYTES} this must
 * equal games-repo `MAX_BUNDLE_BYTES` (`maxProjectBytes`). Not a round KiB.
 *
 * One derived ceiling, not a sum of per-feature constants (games-repo #281). Check 4
 * bills each author for measured `assembled − platformBytes` against the 624 KiB
 * author budget; this number is serve-compat only so a game that clears that gate
 * is not refused here. Archaeology lives in the games repo's
 * `docs/platform-byte-ledger.md`. Raise this when measurement shows a passing game
 * would exceed it — do not re-split it into named allowances on this side either.
 *
 * The platform ceiling last moved for carjack-city's ai/effects crowd helpers and
 * wind-aware vehicle FX: measured platform ~400_249 bytes. 400_000 → 410_000.
 *
 * Before that: coastal road-mask/weather/foot-clearance, 380 → 400 KiB; urban
 * ground/shadow/headlight/extrusion, 340 → 380 KiB.
 *
 * Sized to the heaviest 2D selection, not gfx3d.
 */
export const GAMEKIT_PLATFORM_BYTES = 410_000;

/**
 * Assembled data-URI text + opt-in loading-screen chrome a raster game may embed.
 * Distinct from author JS and from the kit. Games-repo Check 4 bills
 * `assembled − platformBytes − rasterBytes` against the author budget, and
 * `rasterBytes` against this ceiling. Presence of `GAME.json.images` is the
 * opt-in — not a new GameKit module.
 */
export const RASTER_ASSET_BUDGET_BYTES = 3 * 1024 * 1024;

/** One GAME.json `images` PNG/WebP file may not exceed this binary size. */
export const RASTER_ASSET_MAX_FILE_BYTES = 400 * 1024;

/**
 * Combined html+js+css size cap — must match games-repo `MAX_BUNDLE_BYTES`.
 * Author JS + platform kit + raster payloads.
 */
export const MAX_PROJECT_BYTES = GAME_BUDGET_BYTES + GAMEKIT_PLATFORM_BYTES + RASTER_ASSET_BUDGET_BYTES;

/**
 * Music embedding contract (games-repo `tools/lib/assemble.ts`):
 * - `GAME.json` → `audio.music` is a single track-name string — the track that autoplays
 * - `GAME.json` → `audio.musicTracks` is an optional array of *extra* track names a game
 *   switches to at runtime (ambient → combat). Games may not fetch, so every named track
 *   is embedded at build time.
 * - Names resolve against the shared catalog (`readMusicCatalog()` /
 *   `shared/audio/music.json`) **or** an optional per-game `music.json` in the delivery
 *   (same `{ version, tracks }` shape). Self-build / MCP agents cannot edit `shared/`, so
 *   a custom score has to ship beside the game — inventing a name that is in neither map
 *   still fails assemble.
 * - A per-game track must not reuse a shared catalog id (collision is refused).
 * - inject `window.__GAME_AUDIO_MUSIC__ = "<name>"` and a tracks object carrying the
 *   default plus every extra
 */
export const MUSIC_CONTRACT = {
  manifestField: 'music',
  manifestFieldType: 'string',
  /** Optional sibling of `music`; absent on the vast majority of games. */
  manifestTracksField: 'musicTracks',
  manifestTracksFieldType: 'string[]',
  /** Historical path; the catalog file may still live here inside `tools/audio.ts`. */
  catalogPath: 'shared/audio/music.json',
  /** Optional deliverable beside GAME.json — custom tracker tracks for this game only. */
  gameMusicPath: 'music.json',
  /**
   * Functions assemble.ts may call to resolve a game's music tracks, newest first.
   *
   * Several are accepted on purpose. The games repo and this contract deploy
   * independently, so a rename lands on one side before the other, and a single
   * hard-coded name turns every unrelated PR red until both sides ship — which is
   * exactly what `resolveMusicTracksForGame` did when per-game `music.json` landed.
   * Accepting the predecessors keeps a staggered rollout green without weakening the
   * check: the assertion is still "assemble resolves music from a catalog", and every
   * name here does that.
   */
  catalogReaders: ['resolveMusicTracksForGame', 'readMusicCatalog'],
  catalogTracksKey: 'tracks',
  windowMusicName: '__GAME_AUDIO_MUSIC__',
  windowTracksName: '__GAME_MUSIC_TRACKS__',
} as const;

/**
 * Raster embedding contract (games-repo `tools/lib/raster-assets.ts`):
 * - `GAME.json` → `images` is an optional `{ kebab-name: "scenes|cast|images/….png|webp" }`
 *   map. Absent means no bitmaps and no loading screen.
 * - Paths stay inside the game directory; assemble never fetches at runtime.
 * - inject `window.__GAME_IMAGE_ASSETS__` (data URIs) plus a decode-progress
 *   loader that fills `__GAME_IMAGE_ELEMENTS__` / `__GAME_IMAGE_PROGRESS__`.
 */
export const IMAGES_CONTRACT = {
  manifestField: 'images',
  windowAssetsName: '__GAME_IMAGE_ASSETS__',
  windowElementsName: '__GAME_IMAGE_ELEMENTS__',
  windowProgressName: '__GAME_IMAGE_PROGRESS__',
} as const;

/**
 * Modules whose source is not `shared/modules/<name>.ts` but a genre vertical with a
 * private multi-file graph behind an index — games-repo assemble `GAME_KIT_VERTICALS`.
 *
 * Kept here rather than next to the bundler because it is a cross-repo value, and the
 * lockstep check compares it: a module can be listed in {@link GAME_KIT_MODULES} on both
 * sides — names agreeing, check green — while this side still looks for it under
 * `shared/modules/`. That is not a 502 on one route, it is a bake failure, and a bake
 * that fails on one game leaves the pointer on the previous snapshot and publishes
 * nothing. `vehicles` became a vertical in games-repo #527 and this map did not follow;
 * the nightly bake had to be the thing that noticed.
 */
export const GAME_KIT_VERTICAL_ENTRIES: Partial<Record<GameKitModuleName, string>> = {
  gfx3d: 'shared/modules/gfx3d/index.ts',
  vehicles: 'shared/verticals/vehicles/index.ts',
  urban: 'shared/verticals/urban/index.ts',
  racing: 'shared/verticals/racing/index.ts',
  football: 'shared/verticals/football/index.ts',
  platformer: 'shared/verticals/platformer/index.ts',
};

/** Pull the `GAME_KIT_VERTICALS = { ... }` object literal out of games-repo assemble source. */
export function extractGameKitVerticals(assembleSource: string): Record<string, string> {
  const match = assembleSource.match(/GAME_KIT_VERTICALS\s*=\s*(?:Object\.freeze\()?\{([\s\S]*?)\}/);
  if (!match) {
    throw new Error('games-repo assemble source has no GAME_KIT_VERTICALS object');
  }
  const entries = [...match[1].matchAll(/['"]?([a-z0-9-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g)];
  if (entries.length === 0) {
    throw new Error('games-repo GAME_KIT_VERTICALS object is empty');
  }
  return Object.fromEntries(entries.map((entry) => [entry[1], entry[2]]));
}

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
    // Any accepted reader satisfies this, with the historical catalog path kept as a
    // final fallback so an older games-repo tip still clears the check.
    readsMusicCatalog:
      MUSIC_CONTRACT.catalogReaders.some((reader) => new RegExp(`\\b${reader}\\s*\\(`).test(assembleSource)) ||
      new RegExp(catalogPathPattern).test(assembleSource),
  };
}

/* ── Delivery contract (games-repo `shared/delivery-contract.json`) ─────────────── */

/** Where the machine-readable delivery contract lives in the games repo. */
export const DELIVERY_CONTRACT_PATH = 'shared/delivery-contract.json';

/** Shape version this side understands. A bump means the shape changed, not the values. */
export const DELIVERY_CONTRACT_VERSION = 1;

/**
 * Fixed files a game may deliver — games-repo `delivery-contract.json` `fixedFiles`, in
 * that order. Order is part of the contract: both sides render it into agent-facing
 * refusal and instruction text, so a reshuffle is a visible change even when the set is
 * identical, and the CI check reports it separately from an add or a remove.
 *
 * Game-shape only: SPEC / GAME / optional music.json / CAPTURE / ACCEPTANCE / TRACE /
 * PLAYTEST / AGENT / EDITOR, the playable trio, and `sim.ts`. Media bytes are produced
 * by our gate and never uploaded, so `media/` is refused rather than listed here.
 */
export const DELIVERY_FIXED_FILES = [
  'SPEC.md',
  'GAME.json',
  // Optional per-game tracker catalog. Self-build agents cannot edit
  // `shared/audio/music.json`, so a custom score ships here (same `{ version, tracks }`
  // shape as the shared catalog). Absent for games that only pick a shared mood track.
  'music.json',
  'CAPTURE.json',
  'ACCEPTANCE.json',
  // The committed behavioural golden. It is not source in the ordinary sense, but the
  // gate replays CAPTURE.json against our engine and diffs the result against this file,
  // so a delivery without it is one the gate cannot check — it fails at the trace stage
  // with `no committed trace`, having proved nothing about the game.
  'TRACE.json',
  // The per-game playtest contract the harness requires of every game (validate Check
  // 26, `tools/lib/playtest-contract.ts`). Same shape of dependency as TRACE.json: a
  // harness-side requirement that only the agent can satisfy, so leaving it off this
  // list does not keep anything out — it makes every delivery unpassable. It did: the
  // check landed in the games repo while this list stayed as it was, and from then on
  // each delivered game reached validate and stopped there, with no gate artifacts and
  // therefore no draft preview for the creator watching.
  'PLAYTEST.json',
  // Validate Check 28 (`tools/lib/agent-contract.ts`) requires AGENT.json so
  // `npm run agent-play` knows whether to replay CAPTURE or load a closed-loop module.
  // Same drift class as TRACE/PLAYTEST above: the check landed in the games repo while
  // this list stayed put, so agents that wrote a correct AGENT.json were told the path
  // was not deliverable, dropped it, and then failed the remote gate at Check 28 —
  // burning a session on allowlist archaeology instead of the game.
  //
  // Accepted, but not hard-required at upload yet: in-flight builder workspaces still ship
  // the pre-companion submit tool that omits AGENT.json, and the two repos cannot deploy
  // atomically. Requiring it at upload would 400 those deliveries before the gate could
  // even run. Let Check 28 report the missing contract until old workspaces drain; then
  // promote to a required upload (same path TRACE/PLAYTEST already took) in
  // `validateSourceUpload`.
  'AGENT.json',
  // Fresh games require compiled EDITOR.json; revisions may carry legacy sources.
  // Optional EDITOR.ts is authoring source; Check 31 proves its JSON is current.
  'EDITOR.json',
  'EDITOR.ts',
  'EDITOR.content.json',
  // Optional: generated from GAME.json howToPlay when a game ships none.
  'index.html',
  'game.ts',
  // Optional: generated from GAME.json theme when a game ships none.
  'style.css',
  'sim.ts',
] as const;

/**
 * Additional source files a game may carry beyond the fixed set — its own modules only.
 * Kept narrow on purpose: relative imports inside the game directory are the one thing
 * games legitimately add, and everything else is a smell. Covers modules under `game/`
 * and other in-game modules (`entities/player.ts`, …).
 *
 * Built from the contract's string form rather than written as a regex literal: `.source`
 * on a literal escapes the `/` inside the character class (`[a-z0-9\/-]`), which would not
 * match the games-repo JSON byte-for-byte and would read as drift on every CI run.
 */
export const DELIVERY_EXTRA_MODULE_PATTERN = new RegExp('^[a-z0-9][a-z0-9/-]{0,60}\\.ts$');

/**
 * First path segments a game may not use. Set semantics, not a sequence — order carries no
 * meaning here and the CI check compares them as sets.
 */
export const DELIVERY_RESERVED_SEGMENTS = [
  'shared',
  'tools',
  'games',
  'node_modules',
  'dist',
  'references',
  'templates',
] as const;

/** Cap on files per delivery. */
export const DELIVERY_MAX_FILES = 200;

/**
 * Additional raster files a game may deliver — quantized PNG/WebP under
 * `scenes/`, `cast/`, or `images/`. Website-ahead of the games-repo JSON
 * (exact-match `extraModulePattern` stays a `.ts` allowlist); a site that
 * accepts a path no game sends yet is inert.
 */
export const DELIVERY_EXTRA_ASSET_PATTERN = new RegExp(
  '^(?:scenes|cast|images)/[a-z0-9][a-z0-9/_-]{0,80}\\.(?:png|webp)$',
  'i',
);

/** Total bytes one delivery may carry. Raised ahead of quantized scene PNGs. */
export const DELIVERY_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** The games-repo delivery contract as read off the wire. */
export interface DeliveryContract {
  version: number;
  fixedFiles: string[];
  extraModulePattern: string;
  reservedSegments: string[];
  maxFiles: number;
  maxUploadBytes: number;
}

/**
 * Parse games-repo `shared/delivery-contract.json`. Unlike the assemble/validate
 * extractors this reads a file written to be read, so it validates the shape strictly and
 * names the offending field: a contract that parses into partial garbage would compare
 * "clean" against this side and hide exactly the drift the check exists to catch.
 */
export function extractDeliveryContract(json: string): DeliveryContract {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error: unknown) {
    throw new Error(
      `games-repo delivery contract is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('games-repo delivery contract must be a JSON object');
  }
  const raw = parsed as Record<string, unknown>;

  return {
    version: readPositiveInteger(raw, 'version'),
    fixedFiles: readStringArray(raw, 'fixedFiles', { allowEmpty: false }),
    extraModulePattern: readPattern(raw, 'extraModulePattern'),
    reservedSegments: readStringArray(raw, 'reservedSegments', { allowEmpty: true }),
    maxFiles: readPositiveInteger(raw, 'maxFiles'),
    maxUploadBytes: readPositiveInteger(raw, 'maxUploadBytes'),
  };
}

function readStringArray(raw: Record<string, unknown>, key: string, options: { allowEmpty: boolean }): string[] {
  const value = raw[key];
  if (!Array.isArray(value)) {
    throw new Error(`games-repo delivery contract field \`${key}\` must be an array of strings`);
  }
  if (!options.allowEmpty && value.length === 0) {
    throw new Error(`games-repo delivery contract field \`${key}\` is empty`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || entry.trim() === '') {
      throw new Error(`games-repo delivery contract \`${key}[${index}]\` is not a non-empty string`);
    }
    return entry;
  });
}

function readPositiveInteger(raw: Record<string, unknown>, key: string): number {
  const value = raw[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`games-repo delivery contract field \`${key}\` must be a positive integer`);
  }
  return value;
}

function readPattern(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`games-repo delivery contract field \`${key}\` must be a non-empty string`);
  }
  try {
    new RegExp(value);
  } catch (error: unknown) {
    throw new Error(
      `games-repo delivery contract field \`${key}\` is not a valid regular expression: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return value;
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

/** Unlike the rest of this file: the two sides must be byte-equivalent below their headers. */
export const EDITOR_CONTRACT_PATH = 'tools/lib/editor-contract.ts';

/**
 * The `any` scan, the second file held byte-equivalent below its header.
 *
 * Both sides refuse the same game code — this side at `submit_sources`, the games repo at
 * validate Check 37 — and the point of refusing early is that the answer is the same one
 * the gate would give. Two implementations of "does this source use `any`" would drift
 * into an agent being told yes and then no, which is worse than being told once, late.
 */
export const TS_ANY_SCAN_PATH = 'tools/lib/ts-any-scan.ts';

/** Strips a file's own leading doc-comment header, exempted from the byte-equivalence rule. */
export function stripLeadingDocComment(source: string): string {
  const match = /^\s*\/\*\*[\s\S]*?\*\/\s*/.exec(source);
  return (match ? source.slice(match[0].length) : source).trim();
}
