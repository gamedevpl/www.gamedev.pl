import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { kitPath } from './kit-install.js';
import { pathInside } from './checkout-sync.js';

export type SourceSnapshot = {
  files: Map<string, { bytes: Buffer; mode: number }>;
  directories: Map<string, number>;
  digest: string;
};
const PENDING = '.gamedev/history-pending.json';
type Journal = { id: string; source: string; result: string; committed: boolean };

export function sourceSnapshot(root: string): SourceSnapshot {
  const files: SourceSnapshot['files'] = new Map(),
    directories = new Map<string, number>();
  let size = 0;
  const walk = (path: string) => {
    const abs = path ? pathInside(root, path) : root,
      stat = lstatSync(abs);
    if (stat.isSymbolicLink()) throw new CliError('History edits refuse symbolic links in game sources.', EXIT_REFUSED);
    if (stat.isDirectory()) {
      directories.set(path, stat.mode & 0o777);
      if (directories.size > 2000) throw new CliError('Source snapshot exceeds 2000 directories.', EXIT_REFUSED);
      for (const entry of readdirSync(abs).sort()) walk(path ? `${path}/${entry}` : entry);
    } else if (stat.isFile()) {
      if (size + stat.size > 32_000_000 || files.size >= 2000)
        throw new CliError('Source snapshot exceeds 32 MB or 2000 files.', EXIT_REFUSED);
      const bytes = readFileSync(abs);
      size += bytes.length;
      if (size > 32_000_000) throw new CliError('Source snapshot exceeds 32 MB.', EXIT_REFUSED);
      files.set(path, { bytes, mode: stat.mode & 0o777 });
    } else throw new CliError('History edits require regular source files and directories.', EXIT_REFUSED);
  };
  walk('');
  const hash = createHash('sha256');
  for (const [path, mode] of [...directories].sort()) hash.update(JSON.stringify(['dir', path, mode]));
  for (const [path, file] of [...files].sort())
    hash.update(JSON.stringify(['file', path, file.mode, file.bytes.toString('base64')]));
  return { files, directories, digest: hash.digest('hex') };
}

export function historyIdentity(root: string): string {
  const hash = createHash('sha256');
  for (const rel of [
    '.gamedev-base.json',
    '.gamedev-slug',
    'gamedev-kit.json',
    '.gamedev/source-slug',
    '.gamedev/local/.gamedev-slug',
    '.gitignore',
    '.gamedevplignore',
  ]) {
    const path = kitPath(root, rel);
    if (existsSync(path)) {
      if (!lstatSync(path).isFile()) throw new CliError('Checkout metadata must be regular files.', EXIT_REFUSED);
      hash.update(JSON.stringify([rel, readFileSync(path).toString('base64')]));
    } else {
      hash.update(JSON.stringify([rel, null]));
    }
  }
  return hash.digest('hex');
}

export function pendingHistoryRoot(cwd: string): string | null {
  let root = resolve(cwd);
  for (let i = 0; i < 40; i++) {
    if (existsSync(join(root, PENDING))) {
      kitPath(root, PENDING);
      return root;
    }
    const parent = dirname(root);
    if (root === parent) return null;
    root = parent;
  }
  return null;
}

function journalPaths(root: string, value: Journal) {
  if (
    !/^[0-9a-f-]{36}$/.test(value.id) ||
    !/^(?:src|games\/[a-z0-9][a-z0-9-]{0,60})$/.test(value.source) ||
    !/^[a-f0-9]{64}$/.test(value.result) ||
    typeof value.committed !== 'boolean'
  )
    throw new CliError('Invalid history recovery journal; sources were left untouched.', EXIT_REFUSED);
  const marker = kitPath(root, value.source === 'src' ? 'gamedev-kit.json' : '.gamedev-slug');
  if (
    !existsSync(marker) ||
    !lstatSync(marker).isFile() ||
    (value.source !== 'src' && readFileSync(marker, 'utf8').trim() !== value.source.slice(6))
  )
    throw new CliError('History recovery does not match this checkout.', EXIT_REFUSED);
  return {
    game: kitPath(root, value.source),
    stage: kitPath(root, `.gamedev/history-stage-${value.id}`),
    backup: kitPath(root, `.gamedev/history-backups/${value.id}`),
    commit: kitPath(root, `.gamedev/history-commit-${value.id}.json`),
  };
}

export function recoverHistoryEdit(root: string): { recovered: boolean; backup: string | null } {
  const file = kitPath(root, PENDING);
  if (!existsSync(file)) return { recovered: false, backup: null };
  if (!lstatSync(file).isFile() || lstatSync(file).size > 4096)
    throw new CliError('Invalid history recovery journal.', EXIT_REFUSED);
  const journal = JSON.parse(readFileSync(file, 'utf8')) as Journal;
  const paths = journalPaths(root, journal);
  if (existsSync(paths.backup) && !lstatSync(paths.backup).isDirectory())
    throw new CliError('History recovery copy must be a directory.', EXIT_REFUSED);
  if (journal.committed) {
    if (
      !existsSync(paths.game) ||
      !lstatSync(paths.game).isDirectory() ||
      !existsSync(paths.backup) ||
      existsSync(paths.stage)
    )
      throw new CliError('Committed history sources are missing; restore the recovery copy manually.', EXIT_REFUSED);
  } else if (existsSync(paths.backup)) {
    if (existsSync(paths.game)) {
      if (existsSync(paths.stage) || sourceSnapshot(paths.game).digest !== journal.result)
        throw new CliError(
          'Sources changed after interruption. Recovery refuses to overwrite them; keep both source copies.',
          EXIT_REFUSED,
        );
      renameSync(paths.game, paths.stage);
    }
    renameSync(paths.backup, paths.game);
  } else if (!existsSync(paths.game)) throw new CliError('History recovery sources are missing.', EXIT_REFUSED);
  rmSync(paths.stage, { recursive: true, force: true });
  rmSync(paths.commit, { force: true });
  rmSync(file);
  return { recovered: true, backup: journal.committed ? paths.backup : null };
}

export function prepareSources(
  snapshot: SourceSnapshot,
  managed: Set<string>,
  desired: Map<string, Buffer>,
): SourceSnapshot {
  const files = new Map(snapshot.files);
  for (const path of managed) files.delete(path);
  for (const [path, bytes] of desired) {
    if (files.has(path)) throw new CliError(`History edit would replace an ignored file: ${path}`, EXIT_REFUSED);
    files.set(path, { bytes, mode: snapshot.files.get(path)?.mode ?? 0o644 });
  }
  const names = new Set(files.keys());
  for (const name of names) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++)
      if (names.has(parts.slice(0, i).join('/')))
        throw new CliError('History edit conflicts with preserved local files.', EXIT_REFUSED);
  }
  if (files.size > 2000 || [...files.values()].reduce((size, f) => size + f.bytes.length, 0) > 32_000_000)
    throw new CliError('Restored sources exceed 32 MB or 2000 files.', EXIT_REFUSED);
  const directories = new Map(
    [...snapshot.directories].filter(
      ([path]) => ![...names].some((name) => path === name || path.startsWith(name + '/')),
    ),
  );
  for (const path of names) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!directories.has(dir)) directories.set(dir, 0o755);
    }
  }
  return { files, directories, digest: '' };
}

export function installHistorySources(input: {
  root: string;
  source: string;
  before: SourceSnapshot;
  after: SourceSnapshot;
  identity: string;
  move?: typeof renameSync;
}): string {
  const move = input.move ?? renameSync,
    id = randomUUID();
  const journal: Journal = { id, source: input.source, result: '0'.repeat(64), committed: false };
  const paths = journalPaths(input.root, journal),
    pending = kitPath(input.root, PENDING);
  if (existsSync(pending))
    throw new CliError('A history operation needs recovery: gamedevpl restore --recover', EXIT_REFUSED);
  mkdirSync(dirname(paths.stage), { recursive: true, mode: 0o700 });
  mkdirSync(dirname(paths.backup), { recursive: true, mode: 0o700 });
  chmodSync(dirname(paths.backup), 0o700);
  mkdirSync(paths.stage, { mode: 0o700 });
  try {
    for (const path of [...input.after.directories.keys()].filter(Boolean).sort((a, b) => a.length - b.length))
      mkdirSync(pathInside(paths.stage, path), { recursive: true });
    for (const [path, file] of input.after.files) {
      const dest = pathInside(paths.stage, path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, file.bytes, { flag: 'wx', mode: file.mode });
      chmodSync(dest, file.mode);
    }
    for (const [path, mode] of [...input.after.directories].sort((a, b) => b[0].length - a[0].length))
      chmodSync(path ? pathInside(paths.stage, path) : paths.stage, mode);
    journal.result = sourceSnapshot(paths.stage).digest;
    if (sourceSnapshot(paths.game).digest !== input.before.digest || historyIdentity(input.root) !== input.identity)
      throw new CliError(
        'Sources or checkout metadata changed during the history operation; retry after reviewing them.',
        EXIT_REFUSED,
      );
    writeFileSync(pending, JSON.stringify(journal), { flag: 'wx', mode: 0o600 });
    try {
      move(paths.game, paths.backup);
      move(paths.stage, paths.game);
      journal.committed = true;
      writeFileSync(paths.commit, JSON.stringify(journal), { flag: 'wx', mode: 0o600 });
      renameSync(paths.commit, pending);
    } catch (error) {
      recoverHistoryEdit(input.root);
      throw error;
    }
    recoverHistoryEdit(input.root);
    return paths.backup;
  } finally {
    if (!existsSync(pending)) rmSync(paths.stage, { recursive: true, force: true });
  }
}
