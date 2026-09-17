import { withCheckoutWriter } from './workbench-lock.js';
import { createHash, randomUUID } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  lstatSync,
  mkdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { pathInside } from './checkout-sync.js';
import { runLadderAsync } from './verify.js';
import type { Workshop } from './workshop.js';

type File = { path: string; data: string };
export function checkpointFiles(root: string): File[] {
  const files: File[] = [];
  let size = 0;
  const walk = (rel: string) => {
    const dir = rel ? pathInside(root, rel) : root;
    if (lstatSync(dir).isSymbolicLink()) throw Error('Checkpoints do not follow symbolic links');
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw Error('Checkpoints do not follow symbolic links');
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) {
        const bytes = readFileSync(pathInside(root, name));
        size += bytes.length;
        if (size > 32_000_000 || files.length >= 2000) throw Error('Checkpoint exceeds 32 MB or 2000 files');
        files.push({ path: name, data: bytes.toString('base64') });
      }
    }
  };
  walk('');
  return files;
}
const digest = (files: File[]) => createHash('sha256').update(JSON.stringify(files)).digest('hex');
async function localActionUnlocked(
  line: string,
  ws: Workshop | undefined,
  write: (s: string) => void,
): Promise<boolean> {
  if (!['/verify', '/checkpoint', '/restore-checkpoint'].includes(line)) return false;
  if (!ws) throw Error('Open a local checkout first');
  const game = pathInside(join(ws.root, 'games'), ws.slug);
  const files = checkpointFiles(game),
    hash = digest(files);
  if (line === '/verify') {
    const abort = new AbortController();
    ws.abort.current = abort;
    ws.onLocalTask?.('verification');
    try {
      const result = await runLadderAsync({ cwd: ws.root, abort: abort.signal });
      write(
        digest(checkpointFiles(game)) !== hash
          ? 'Sources changed during verification; result is stale.'
          : result.ok
            ? `Local checks passed for sources ${hash}. Publishing gate runs on delivery.`
            : `Verification failed at ${result.stage}: ${result.detail}`,
      );
    } finally {
      ws.abort.current = null;
      ws.onLocalTask?.('');
    }
    return true;
  }
  const path = join(ws.root, '.gamedev-play-checkpoint.json');
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw Error('Checkpoint must be a regular file');
  if (line === '/checkpoint') {
    if (
      existsSync(path) &&
      (await ws.pick(['Replace checkpoint', 'Cancel'], 'Replace the saved source checkpoint?')) !== 'Replace checkpoint'
    )
      return true;
    writeFileSync(path, JSON.stringify({ slug: ws.slug, hash, files }), { mode: 0o600 });
    write(`Saved source checkpoint ${hash}.`);
    return true;
  }
  if (lstatSync(path).size > 48_000_000) throw Error('Checkpoint exceeds size limit');
  const saved = JSON.parse(readFileSync(path, 'utf8')) as { slug: string; hash: string; files: File[] };
  if (
    saved.slug !== ws.slug ||
    !Array.isArray(saved.files) ||
    saved.files.length > 2000 ||
    saved.files.some((f) => typeof f.path !== 'string' || typeof f.data !== 'string') ||
    digest(saved.files) !== saved.hash
  )
    throw Error('Invalid checkpoint');
  write(`Restore checkpoint ${saved.hash}. Files: ${saved.files.map((f) => f.path).join(', ')}`);
  if (
    (await ws.pick(
      ['Restore checkpoint', 'Cancel'],
      'Replace current source files? A recovery copy will be saved.',
    )) !== 'Restore checkpoint'
  )
    return true;
  const stage = join(ws.root, `.gamedev-play-restore-${randomUUID()}`),
    backup = join(ws.root, `.gamedev-play-recovery-${randomUUID()}`);
  mkdirSync(stage, { mode: 0o700 });
  try {
    for (const file of saved.files) {
      const dest = pathInside(stage, file.path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, Buffer.from(file.data, 'base64'), { flag: 'wx', mode: 0o600 });
    }
    if (digest(checkpointFiles(game)) !== hash) throw Error('Sources changed; review the restore again');
    renameSync(game, backup);
    try {
      renameSync(stage, game);
    } catch (error) {
      renameSync(backup, game);
      throw error;
    }
    write(`Restored checkpoint. Pre-restore sources preserved in ${backup}.`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  return true;
}

export async function workbenchLocalAction(...args: Parameters<typeof localActionUnlocked>): Promise<boolean> {
  if (!['/verify', '/checkpoint', '/restore-checkpoint'].includes(args[0])) return false;
  const ws = args[1];
  return ws ? withCheckoutWriter(ws.root, () => localActionUnlocked(...args)) : localActionUnlocked(...args);
}
