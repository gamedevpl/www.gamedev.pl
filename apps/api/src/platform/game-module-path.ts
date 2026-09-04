// Resolves a relative import to the .ts file behind it.

// TypeScript ESM writes all three of ./foo.ts, ./foo.js and ./foo.

import path from 'node:path';

export function resolveGameTypeScriptPath(resolveDir: string, specifier: string): string | null {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return null;
  }
  const resolvedPath = path.posix.resolve(resolveDir, specifier);
  if (resolvedPath.endsWith('.ts')) {
    return resolvedPath;
  }
  if (resolvedPath.endsWith('.js')) {
    return `${resolvedPath.slice(0, -'.js'.length)}.ts`;
  }
  // Extensionless — only accept bare paths (no other extension). `./foo.json` stays rejected.
  if (path.posix.extname(resolvedPath) !== '') {
    return null;
  }
  return `${resolvedPath}.ts`;
}
