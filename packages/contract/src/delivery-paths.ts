// Delivery allowlist; lockstep and merge order live in games-repo-contract.ts.

// games-repo fixedFiles, in order: refusal text renders it, CI diffs it.
export const DELIVERY_FIXED_FILES = [
  'SPEC.md',
  'GAME.json',
  // Optional custom score; agents cannot edit shared/audio/music.json.
  'music.json',
  'CAPTURE.json',
  'ACCEPTANCE.json',
  // Behavioural golden: without it the gate fails at `no committed trace`.
  'TRACE.json',
  'PLAYTEST.json',
  'AGENT.json',
  'EDITOR.json',
  'EDITOR.ts',
  'EDITOR.content.json',
  // index.html and style.css are generated from GAME.json when absent.
  'index.html',
  'game.ts',
  'style.css',
  'sim.ts',
] as const;

// Own modules; string form keeps `.source` equal to games-repo JSON.
export const DELIVERY_EXTRA_MODULE_PATTERN = new RegExp('^[a-z0-9][a-z0-9/-]{0,60}\\.ts$');

// Game-owned PNG/WebP under scenes/, cast/ or images/.
export const DELIVERY_EXTRA_ASSET_PATTERN = new RegExp(
  '^(?:scenes|cast|images)/[a-z0-9][a-z0-9/_-]{0,80}\\.(?:png|webp)$',
  'i',
);

// Harness-looking first segments; a set, so order carries no meaning.
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
