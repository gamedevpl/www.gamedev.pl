import path from 'node:path';

export const SEED_TOP_LEVEL_FILES: readonly string[] = [
  'SPEC.md',
  'GAME.json',
  'music.json',
  'EDITOR.json',
  'EDITOR.content.json',
  'game.ts',
  'index.html',
  'style.css',
  'ACCEPTANCE.json',
];

const TOP_LEVEL_ALLOWED = new Set(SEED_TOP_LEVEL_FILES);

export function normalizeSeedPath(relative: string, slug: string): string {
  let normalized = relative.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  const prefix = `games/${slug}/`;
  if (normalized.startsWith(prefix)) normalized = normalized.slice(prefix.length);
  return path.posix.normalize(normalized);
}

export function isAllowedSeedPath(normalized: string): boolean {
  if (!normalized || normalized.startsWith('..') || normalized.startsWith('/') || path.posix.isAbsolute(normalized)) {
    return false;
  }
  if (TOP_LEVEL_ALLOWED.has(normalized)) return true;
  return normalized.startsWith('game/') && normalized.endsWith('.ts');
}
