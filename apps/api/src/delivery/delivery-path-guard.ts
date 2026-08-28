import { DELIVERY_FIXED_FILES } from '../platform/games-repo-contract.js';

const FORBIDDEN_DELIVERY_BASENAME =
  /^(tsconfig(\..*)?\.json|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|composer\.json|\.npmrc|\.eslintrc(\..*)?|vite\.config\..+|webpack\.config\..+|rollup\.config\..+|jest\.config\..+|vitest\.config\..+)$/i;
const FORBIDDEN_DELIVERY_EXTENSION = /\.(js|mjs|cjs|jsx|tsx|sh|bash|zsh|ps1|bat|cmd|exe|bin|yml|yaml|toml|lock)$/i;

const ALLOWED_SOURCES_HINT = `${DELIVERY_FIXED_FILES.join(', ')}, your own .ts modules, or scenes/cast/images PNG/WebP`;

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

export function forbiddenIndexHtmlWriteReason(path: string, content: string): string | null {
  if (path !== 'index.html' || !content.trim()) return null;
  return (
    'index.html cannot be staged or patched — it is generated from GAME.json howToPlay, never hand-authored. ' +
    'Add a valid howToPlay to GAME.json instead: at minimum howToPlay.goal and howToPlay.hint, each a ' +
    '{"en": "...", "pl": "..."} pair (both languages, both non-empty) — that is what the generator requires ' +
    'to produce a playable page; optional controls/scoring/mode add more rows. Without it, the game has no ' +
    'markup and the gate refuses it as unplayable. If an index.html from an earlier round is in the way, ' +
    'call delete_source_file("index.html").'
  );
}
