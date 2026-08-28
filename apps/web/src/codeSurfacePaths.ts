// Client twin of games-store assertDeliverableSourcePath.

export const FIXED_SOURCE_FILES = [
  'SPEC.md',
  'GAME.json',
  'music.json',
  'CAPTURE.json',
  'ACCEPTANCE.json',
  'TRACE.json',
  'PLAYTEST.json',
  'AGENT.json',
  'EDITOR.json',
  'EDITOR.ts',
  'EDITOR.content.json',
  'index.html',
  'game.ts',
  'style.css',
  'sim.ts',
] as const;

export const RESERVED_SOURCE_SEGMENTS = new Set([
  'shared',
  'tools',
  'games',
  'node_modules',
  'dist',
  'references',
  'templates',
]);

const EXTRA_MODULE_PATTERN = /^[a-z0-9][a-z0-9/-]{0,60}\.ts$/;
const FOLDER_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,40}$/;
const MAX_PATH_LENGTH = 120;
export const MAX_FILE_BYTES = 1_000_000;

export function normalizeSourcePath(raw: string): string {
  return raw.trim().replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

export function parentDir(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash <= 0 ? '' : path.slice(0, slash);
}

export function baseName(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? path : path.slice(slash + 1);
}

export function joinSourcePath(dir: string, name: string): string {
  const left = normalizeSourcePath(dir);
  const right = normalizeSourcePath(name);
  if (!left) return right;
  if (!right) return left;
  return `${left}/${right}`;
}

export function isUnderPrefix(path: string, prefix: string): boolean {
  const folder = normalizeSourcePath(prefix);
  if (!folder) return true;
  return path === folder || path.startsWith(`${folder}/`);
}

export function wouldNestInsideSelf(fromPrefix: string, toPrefix: string): boolean {
  const from = normalizeSourcePath(fromPrefix);
  const to = normalizeSourcePath(toPrefix);
  if (!from) return false;
  return to === from || to.startsWith(`${from}/`);
}

export function isFolderName(name: string): boolean {
  return FOLDER_NAME_PATTERN.test(name);
}

export function stubForPath(path: string): string {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'export {};\n';
  if (path.endsWith('.json')) return '{}\n';
  if (path.endsWith('.css')) return '\n';
  if (path.endsWith('.html')) return '\n';
  if (path.endsWith('.md')) return '\n';
  return '\n';
}

export function deliverablePathReason(rawPath: string): string | null {
  const path = normalizeSourcePath(rawPath);
  if (!path) return 'empty path';
  if (path.length > MAX_PATH_LENGTH) return 'path too long';
  if (path.includes('..') || path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    return 'illegal path';
  }
  if (path.startsWith('.') || path.split('/').some((segment) => segment.startsWith('.'))) {
    return 'hidden paths are not game sources';
  }
  if (path === 'media' || path.startsWith('media/')) return 'media is produced by the gate, not uploaded';
  const first = path.split('/')[0] ?? path;
  if (RESERVED_SOURCE_SEGMENTS.has(first)) return `${first}/ is read-only`;
  const allowed =
    (FIXED_SOURCE_FILES as readonly string[]).includes(path) ||
    (EXTRA_MODULE_PATTERN.test(path) && !path.includes('//'));
  if (!allowed) return 'not a deliverable game source';
  return null;
}

export function indexHtmlWriteReason(path: string, content: string): string | null {
  if (path !== 'index.html' || !content.trim()) return null;
  return 'index.html is generated from GAME.json howToPlay';
}

export function decodeTextBytes(bytes: Uint8Array): string | null {
  if (bytes.length > MAX_FILE_BYTES) return null;
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function folderPathReason(rawPath: string): string | null {
  const path = normalizeSourcePath(rawPath);
  if (!path) return 'empty path';
  if (path.length > MAX_PATH_LENGTH) return 'path too long';
  if (path.includes('..') || path.includes('\\') || path.includes('\0')) return 'illegal path';
  const segments = path.split('/');
  if (RESERVED_SOURCE_SEGMENTS.has(segments[0] ?? '')) return `${segments[0]}/ is read-only`;
  if (!segments.every(isFolderName)) return 'folder names must be lowercase letters, digits, or hyphen';
  return null;
}
