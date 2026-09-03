import path from 'node:path';

const TOP_LEVEL_ALLOWED = new Set([
  'SPEC.md',
  'GAME.json',
  'game.ts',
  'index.html',
  'style.css',
  'ACCEPTANCE.json',
  'EDITOR.json',
  'EDITOR.ts',
  'EDITOR.content.json',
]);

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
