import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

type Entry = { path: string; existed: boolean };
type Journal = { stage: string; entries: Entry[]; committed: boolean };
const JOURNAL = '.gamedev/kit-update.json';
const RESERVED = new Set([
  'games',
  '.git',
  '.gamedev',
  'gamedev.lock',
  'setup.mjs',
  'README.md',
  'WORKSPACE.json',
  '.gitignore',
  'node_modules',
]);

export function kitPath(root: string, path: string): string {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes(':') ||
    path.includes('\0') ||
    path.split('/').some((part) => !part || part === '.' || part === '..' || part.endsWith('.') || part.endsWith(' '))
  )
    throw new CliError('Invalid Creator Kit install path.', EXIT_REFUSED);
  let current = root;
  for (const part of path.split('/')) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new CliError(`Kit update refuses a symbolic link at ${path}.`, EXIT_REFUSED);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return current;
}

function managed(root: string): string[] {
  const file = kitPath(root, '.gamedev/kit-manifest.json');
  if (!existsSync(file)) return [];
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as { ignoreEntries?: unknown };
  if (!Array.isArray(manifest.ignoreEntries)) throw new CliError('Invalid Creator Kit manifest.', EXIT_REFUSED);
  return manifest.ignoreEntries.map((entry: unknown) => {
    if (typeof entry !== 'string') throw new CliError('Invalid Creator Kit path.', EXIT_REFUSED);
    const path = entry.replace(/^\//, '').replace(/\/$/, '');
    kitPath(root, path);
    if (
      [...RESERVED].some((reserved) => reserved.toLowerCase() === path.split('/')[0]!.toLowerCase()) ||
      path.startsWith('.gamedev-')
    )
      throw new CliError(`Kit cannot replace ${path}.`, EXIT_REFUSED);
    return path;
  });
}

// Recovery restores only kit-owned paths.
export function recoverKitInstall(root: string): void {
  const file = kitPath(root, JOURNAL);
  if (!existsSync(file)) return;
  const journal = JSON.parse(readFileSync(file, 'utf8')) as Journal;
  if (!/^\.gamedev\/kit-stage-[a-zA-Z0-9]+$/.test(journal.stage) || !Array.isArray(journal.entries))
    throw new CliError('Invalid pending Kit update; cannot recover automatically.', EXIT_REFUSED);
  const stage = kitPath(root, journal.stage);
  if (!journal.committed) {
    for (const entry of [...journal.entries].reverse()) {
      const destination = kitPath(root, entry.path);
      // Journal paths get the same namespace restriction as manifests, plus fixed metadata.
      if (
        [...RESERVED].some((reserved) => reserved.toLowerCase() === entry.path.split('/')[0]!.toLowerCase()) &&
        !['gamedev.lock', '.gitignore', 'node_modules', '.gamedev/kit-manifest.json'].includes(entry.path)
      )
        throw new CliError('Unsafe pending Kit update path.', EXIT_REFUSED);
      const backup = kitPath(stage, `backup/${entry.path}`);
      if (existsSync(backup)) {
        rmSync(destination, { recursive: true, force: true });
        mkdirSync(dirname(destination), { recursive: true });
        renameSync(backup, destination);
      } else if (!entry.existed) rmSync(destination, { recursive: true, force: true });
    }
  }
  rmSync(stage, { recursive: true, force: true });
  rmSync(file);
}

export function installPreparedKit(root: string, stage: string, move = renameSync): void {
  const oldPaths = managed(root);
  const newPaths = managed(stage);
  for (const path of ['package.json', 'kit.json', 'node_modules', 'gamedev.lock', '.gamedev/kit-manifest.json']) {
    if (!existsSync(kitPath(stage, path))) throw new CliError('Prepared Creator Kit is incomplete.', EXIT_REFUSED);
  }
  if (!newPaths.includes('package.json') || !newPaths.includes('kit.json'))
    throw new CliError('Prepared Creator Kit manifest is incomplete.', EXIT_REFUSED);
  const metadata = ['node_modules', '.gitignore', '.gamedev/kit-manifest.json', 'gamedev.lock'];
  const paths = [...new Set([...oldPaths, ...newPaths, ...metadata])];
  for (const path of newPaths) {
    if (!oldPaths.includes(path) && existsSync(kitPath(root, path)))
      throw new CliError(`Kit update would overwrite an unowned path: ${path}`, EXIT_REFUSED);
  }
  if (paths.some((path) => paths.some((other) => other !== path && path.startsWith(`${other}/`))))
    throw new CliError('Overlapping Creator Kit install paths.', EXIT_REFUSED);
  const entries = paths.map((path) => ({ path, existed: existsSync(kitPath(root, path)) }));
  const journal: Journal = { stage: relative(root, stage).split(sep).join('/'), entries, committed: false };
  const file = kitPath(root, JOURNAL);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(journal), { flag: 'wx', mode: 0o600 });
  try {
    for (const entry of entries) {
      const destination = kitPath(root, entry.path);
      if (entry.existed) {
        const backup = kitPath(stage, `backup/${entry.path}`);
        mkdirSync(dirname(backup), { recursive: true });
        move(destination, backup);
      }
      const prepared = kitPath(stage, entry.path);
      if (existsSync(prepared)) {
        mkdirSync(dirname(destination), { recursive: true });
        move(prepared, destination);
      }
    }
    journal.committed = true;
    const next = kitPath(root, `${JOURNAL}.next`);
    writeFileSync(next, JSON.stringify(journal), { mode: 0o600 });
    renameSync(next, file);
  } catch (error) {
    recoverKitInstall(root);
    throw error;
  }
  recoverKitInstall(root);
}
