// Delivery path allowlist, shared by API enforcement and CLI filtering.
// Lockstep with games-repo delivery-contract.json; see games-repo-contract.ts.

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

// Game-owned PNG/WebP under scenes/, cast/ or images/.
export const DELIVERY_EXTRA_ASSET_PATTERN = new RegExp(
  '^(?:scenes|cast|images)/[a-z0-9][a-z0-9/_-]{0,80}\\.(?:png|webp)$',
  'i',
);

/**
 * First path segments a game may not use. Set semantics, not a sequence — order carries no
 * meaning here and the CI check compares them as sets.
 *
 * Note these are *not* what confines an upload — that is structural: every stored path is
 * prefixed with the version's own `source/`, and `..` is rejected by shape. They are
 * rejected anyway because a game directory containing `shared/` or `tools/` reads as
 * though it were editing the harness, and a boundary is only useful if a human reviewing
 * a diff can see it holding.
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

export function isRasterSourcePath(path: string): boolean {
  return DELIVERY_EXTRA_ASSET_PATTERN.test(path) && !path.includes('//');
}

const FORBIDDEN_DELIVERY_BASENAME =
  /^(tsconfig(\..*)?\.json|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|composer\.json|\.npmrc|\.eslintrc(\..*)?|vite\.config\..+|webpack\.config\..+|rollup\.config\..+|jest\.config\..+|vitest\.config\..+)$/i;
const FORBIDDEN_DELIVERY_EXTENSION = /\.(js|mjs|cjs|jsx|tsx|sh|bash|zsh|ps1|bat|cmd|exe|bin|yml|yaml|toml|lock)$/i;

const ALLOWED_SOURCES_HINT = `${DELIVERY_FIXED_FILES.join(', ')}, your own .ts modules, or scenes/cast/images PNG/WebP`;

// Refusal for config-, executable- or media-shaped paths, else null.
export function forbiddenDeliveryPathReason(path: string): string | null {
  const basename = path.split('/').pop() ?? path;
  if (path.startsWith('.') || path.split('/').some((segment) => segment.startsWith('.'))) {
    return (
      `path not deliverable: ${path}. Dotfiles and hidden paths are config/executable-shaped — ` +
      `deliver only game sources (${ALLOWED_SOURCES_HINT}).`
    );
  }
  if (path === 'media' || path.startsWith('media/')) {
    return (
      `path not deliverable: ${path}. Media is produced by the platform gate, not uploaded — ` +
      'deliver game sources only.'
    );
  }
  if (FORBIDDEN_DELIVERY_BASENAME.test(basename) || FORBIDDEN_DELIVERY_EXTENSION.test(basename)) {
    return (
      `path not deliverable: ${path}. Config or executable-shaped files are refused — ` +
      `deliver only game sources (${ALLOWED_SOURCES_HINT}).`
    );
  }
  if (path.includes('.github/') || basename === 'Dockerfile' || basename === 'Makefile') {
    return `path not deliverable: ${path}. Workflow/build files are refused — deliver only game sources.`;
  }
  return null;
}

const RESERVED_SEGMENTS = new Set<string>(DELIVERY_RESERVED_SEGMENTS);

// Exact upload refusal text for rawPath, or null when deliverable.
export function deliveryPathRefusal(rawPath: string): string | null {
  const path = rawPath.trim();
  // Traversal is refused by shape before anything else.
  if (path.includes('..') || path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    return `illegal path: ${rawPath}`;
  }

  const forbidden = forbiddenDeliveryPathReason(path);
  if (forbidden) return forbidden;

  const first = path.split('/')[0] ?? '';
  if (RESERVED_SEGMENTS.has(first)) {
    return (
      `path not deliverable: ${path}. \`${first}\` belongs to the harness — ` +
      'GameKit, the tooling and other games are read-only context.'
    );
  }

  const allowed =
    (DELIVERY_FIXED_FILES as readonly string[]).includes(path) ||
    (DELIVERY_EXTRA_MODULE_PATTERN.test(path) && !path.includes('//')) ||
    isRasterSourcePath(path);
  if (!allowed) {
    return (
      `path not deliverable: ${path}. Deliver only your own game's files ` +
      `(${DELIVERY_FIXED_FILES.join(', ')}, your own .ts modules, or scenes/cast/images PNG/WebP).`
    );
  }
  return null;
}

// True for games/<slug>/-relative paths; untrimmed, since the API trims.
export function isDeliverablePath(path: string): boolean {
  return path === path.trim() && deliveryPathRefusal(path) === null;
}
