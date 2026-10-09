import { withCheckoutWriter } from './workbench-lock.js';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathInside } from './checkout-sync.js';
import { checkpointFiles, checkpointDigest } from './checkpoint-files.js';
export { checkpointFiles } from './checkpoint-files.js';
import { runLadderAsync, VerificationError } from './verify.js';
import { recoverVerification } from './repl-delivery.js';
import { formatError } from './errors.js';
import type { ApiClient } from './api.js';
import type { Workshop } from './workshop.js';

async function localActionUnlocked(
  line: string,
  ws: Workshop | undefined,
  write: (s: string) => void,
  api?: ApiClient,
): Promise<boolean> {
  if (!['/verify', '/checkpoint', '/restore-checkpoint'].includes(line)) return false;
  if (!ws) throw Error('Open a local checkout first');
  const game = pathInside(join(ws.root, 'games'), ws.slug);
  const files = checkpointFiles(game),
    hash = checkpointDigest(files);
  if (line === '/verify') {
    const abort = new AbortController();
    ws.abort.current = abort;
    ws.onLocalTask?.('verification');
    let failure: VerificationError | undefined;
    try {
      const result = await runLadderAsync({ cwd: ws.root, run: ws.run, abort: abort.signal });
      if (abort.signal.aborted) write('Verification stopped. Your edits remain local.');
      else if (checkpointDigest(checkpointFiles(game)) !== hash)
        write('Sources changed during verification; result is stale.');
      else if (result.ok) write(`Local checks passed for sources ${hash}. Publishing gate runs on delivery.`);
      else {
        failure = new VerificationError(result, ws.root);
        write(api && !ws.unattended ? failure.message : formatError(failure));
      }
    } finally {
      ws.abort.current = null;
      ws.onLocalTask?.('');
    }
    if (failure && api && !ws.unattended)
      await recoverVerification(
        {
          line,
          api,
          token: ws.token,
          workshop: ws,
          write,
          pick: ws.pick,
          onActivity: ws.onActivity,
          telemetry: ws.telemetry,
        },
        { api, slug: ws.slug, dest: ws.root, run: ws.run },
        failure,
        ws.pick,
        ws,
        false,
      );
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
  const saved = JSON.parse(readFileSync(path, 'utf8')) as {
    slug: string;
    hash: string;
    files: ReturnType<typeof checkpointFiles>;
  };
  if (
    saved.slug !== ws.slug ||
    !Array.isArray(saved.files) ||
    saved.files.length > 2000 ||
    saved.files.some((f) => typeof f.path !== 'string' || typeof f.data !== 'string') ||
    checkpointDigest(saved.files) !== saved.hash
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
    if (checkpointDigest(checkpointFiles(game)) !== hash) throw Error('Sources changed; review the restore again');
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
