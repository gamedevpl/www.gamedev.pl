import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, parse } from 'node:path';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

export function noSymlinks(path: string): void {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const segment of absolute.slice(current.length).split(/[\\/]/)) {
    current = join(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (stat?.isSymbolicLink()) throw new CliError(`refusing symlink in plugin path: ${current}`, EXIT_REFUSED);
  }
}

export function writePluginFile(path: string, data: Buffer | string): void {
  noSymlinks(path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, data, { mode: 0o600, flag: 'wx' });
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

export function claimPluginPath(path: string, bytes?: Buffer): void {
  noSymlinks(path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (bytes) writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
  else mkdirSync(path, { mode: 0o700 });
}

export function treeDigest(path: string): string {
  noSymlinks(path);
  const hash = createHash('sha256');
  let count = 0;
  function visit(file: string, relative: string): void {
    if (++count > 1000) throw new CliError('plugin tree exceeds file limit', EXIT_REFUSED);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
      throw new CliError('plugin tree contains a link or special file', EXIT_REFUSED);
    hash.update(`${relative}\0`);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(file).sort()) visit(join(file, entry), `${relative}/${entry}`);
    } else {
      if (stat.size > 4_000_000) throw new CliError('plugin file exceeds size limit', EXIT_REFUSED);
      hash.update(readFileSync(file));
    }
  }
  visit(path, '');
  return hash.digest('hex');
}

export function pluginTrees(roots: string[], names: string[]): string[] {
  const found: string[] = [];
  let visited = 0;
  function visit(path: string, depth: number): void {
    if (!existsSync(path) || depth > 7) return;
    if (++visited > 3000) throw new CliError('plugin directory scan exceeds limit', EXIT_REFUSED);
    noSymlinks(path);
    if (!lstatSync(path).isDirectory()) return;
    for (const name of [
      'plugin.json',
      '.claude-plugin/plugin.json',
      '.codex-plugin/plugin.json',
      '.cursor-plugin/plugin.json',
      'gemini-extension.json',
    ]) {
      const manifest = join(path, name);
      if (!existsSync(manifest)) continue;
      noSymlinks(manifest);
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string };
        if (parsed.name && names.includes(parsed.name)) {
          found.push(path);
          return;
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      if (entry.isSymbolicLink()) throw new CliError('plugin directory contains a symlink', EXIT_REFUSED);
      if (entry.isDirectory()) visit(join(path, entry.name), depth + 1);
    }
  }
  for (const root of roots) visit(root, 0);
  return found.sort();
}
