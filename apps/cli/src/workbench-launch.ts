import { workbenchScope, workerEntry, assertRequestedGame, type WorkbenchEntry } from './workbench-entry.js';
import { acquireStartupLock } from './workbench-startup-lock.js';
import { CliError } from './exit-codes.js';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, openSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { privatePlayDirectory, readPlayState } from './play-state.js';
import { openUrl } from './open-url.js';
import type { ApiClient } from './api.js';
import { findCheckout } from './checkout.js';

export type PlayJournal = {
  version: 1;
  instance: string;
  cwd: string;
  pid?: number;
  url?: string;
  initial?: string;
  launch?: WorkbenchEntry;
  token?: string | null;
  slug?: string;
  checkout?: { root: string; slug: string };
  pending?: { path: string; hash: string; startedAt: string };
  remote?: { path: string; result: unknown };
  ended?: boolean;
};
export function savePlayJournal(path: string, value: PlayJournal): void {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
  renameSync(temp, path);
}
function journalAt(path: string): PlayJournal | undefined {
  const raw = readPlayState(path);
  if (!raw) return;
  const value = JSON.parse(raw) as PlayJournal;
  if (value.version !== 1 || typeof value.cwd !== 'string' || typeof value.instance !== 'string')
    throw Error('Invalid Play journal');
  return value;
}
async function health(journal: PlayJournal): Promise<boolean> {
  if (!journal.url) return false;
  const url = new URL(journal.url);
  if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:' || !/^#[a-f0-9]{64}$/.test(url.hash)) return false;
  try {
    return (
      await fetch(`${url.origin}/state`, {
        headers: { Authorization: `Bearer ${url.hash.slice(1)}` },
        signal: AbortSignal.timeout(1000),
        redirect: 'error',
      })
    ).ok;
  } catch {
    return false;
  }
}
function running(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
export function nextPlayJournal(
  existing: PlayJournal | undefined,
  cwd: string,
  idea: string | undefined,
  write: (line: string) => void,
): PlayJournal {
  if (existing && (!existing.ended || existing.pending)) {
    if (idea)
      write(
        'Resuming the previous Play session. The supplied idea was not sent; review the previous work and enter it in Play.',
      );
    return { ...existing, ended: false, pid: undefined, url: undefined, initial: undefined };
  }
  return { version: 1, instance: randomUUID(), cwd, initial: idea };
}
export async function launchWorkbench(input: {
  cwd: string;
  entry: string;
  env: NodeJS.ProcessEnv;
  idea?: string;
  launch?: WorkbenchEntry;
  noOpen: boolean;
  write: (line: string) => void;
}) {
  const cwd = realpathSync(input.cwd),
    base = join(tmpdir(), `gamedev-workbench-${process.getuid?.() ?? 'user'}`);
  privatePlayDirectory(base);
  const key = createHash('sha256').update(workbenchScope(cwd, input.launch)).digest('hex'),
    path = join(base, `${key}.json`),
    lock = join(base, `${key}.lock`);
  const legacy = journalAt(join(base, createHash('sha256').update(cwd).digest('hex') + '.json'));
  if (input.launch?.mode === 'create' && legacy?.pending)
    throw Error(
      'A previous request in this directory has an unknown outcome. Reopen gamedevpl play --edit and reconcile it before creating another game.',
    );
  const existing = journalAt(path);
  assertRequestedGame(existing, input.launch);
  if (existing && (await health(existing))) {
    input.write(`Existing Play session: ${existing.url}`);
    if (input.idea) input.write('The supplied idea was not sent. Review the active session and enter it in Play.');
    if (!input.noOpen) await openUrl(existing.url!);
    return existing.url!;
  }
  if (existing && !existing.ended && running(existing.pid))
    throw Error(
      'Play process is still alive but not responding. Reconnect after it recovers; a second writer was not started.',
    );
  const releaseStartup = acquireStartupLock(lock, existing?.pid);
  try {
    const journal = nextPlayJournal(existing, cwd, input.idea, input.write);
    if (!existing || (existing.ended && !existing.pending)) journal.launch = input.launch;
    savePlayJournal(path, journal);
    const log = openSync(join(base, `${key}.log`), 'a', 0o600);
    let child;
    try {
      child = spawn(process.execPath, [...process.execArgv, resolve(input.entry), '__play-session', path], {
        cwd,
        env: input.env,
        detached: true,
        stdio: ['ignore', log, log],
        windowsHide: true,
      });
    } finally {
      closeSync(log);
    }
    let failure: Error | undefined;
    child.once('error', (error) => {
      failure = error;
    });
    child.unref();
    for (let i = 0; i < 100; i++) {
      if (failure) throw failure;
      const state = journalAt(path);
      if (state?.url && (await health(state))) {
        input.write(`Play session: ${state.url}`);
        input.write(
          'Runs in the background; Ctrl+C does not stop it. Stop it from the browser: Commands → End session.',
        );
        if (!input.noOpen && !(await openUrl(state.url)))
          input.write('Browser could not open. Copy the Play session URL above.');
        return state.url;
      }
      if (child.exitCode !== null)
        throw Error('Play exited during startup. Retry after inspecting the local session log.');
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error('Play is still starting. Run the same command to reconnect; do not launch a second writer.');
  } finally {
    releaseStartup();
  }
}
export function journalApi(api: ApiClient, journal: PlayJournal, save: () => void): ApiClient {
  return {
    ...api,
    async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
      // Presence and preparation cannot consume build or delivery receipts.
      const preparesTurn =
        /^\/api\/submissions\/[^/?#]+\/turn$/.test(path) &&
        body !== null &&
        typeof body === 'object' &&
        'prepareOnly' in body &&
        body.prepareOnly === true;
      if (
        method === 'GET' ||
        (method === 'POST' && (/^\/api\/me\/studio\/local-activity\/[^/?#]+$/.test(path) || preparesTurn))
      )
        return api.request(method, path, body, signal);
      if (journal.pending)
        throw Error(
          'A previous platform request has an unknown outcome. Inspect Studio before starting more platform mutations. Local play and read-only status remain available.',
        );
      journal.pending = {
        path,
        hash: createHash('sha256')
          .update(JSON.stringify(body ?? null))
          .digest('hex'),
        startedAt: new Date().toISOString(),
      };
      save();
      try {
        const result = await api.request<T>(method, path, body, signal);
        journal.remote = { path, result };
        if (
          path === '/api/submissions' &&
          result &&
          typeof result === 'object' &&
          'token' in result &&
          'slug' in result &&
          typeof result.token === 'string' &&
          typeof result.slug === 'string'
        ) {
          journal.token = result.token;
          journal.slug = result.slug;
        }
        delete journal.pending;
        save();
        return result;
      } catch (error) {
        if (error instanceof CliError && error.httpStatus && error.httpStatus >= 400 && error.httpStatus < 500) {
          delete journal.pending;
          save();
        }
        throw error;
      }
    },
  };
}
export async function runPlayWorker(input: {
  api: ApiClient;
  path: string;
  env: NodeJS.ProcessEnv;
  entry: string;
  login: (write: (line: string) => void) => Promise<void>;
}) {
  const expected = join(tmpdir(), `gamedev-workbench-${process.getuid?.() ?? 'user'}`);
  if (dirname(resolve(input.path)) !== expected) throw Error('Invalid session journal path');
  privatePlayDirectory(expected);
  const journal = journalAt(input.path);
  if (!journal) throw Error('Session journal missing');
  journal.pid = process.pid;
  delete journal.url;
  const save = () => savePlayJournal(input.path, journal);
  save();
  const api = journalApi(input.api, journal, save);
  const { runInkRepl } = await import('./tui/host.js');
  const start = workerEntry(journal);
  delete journal.initial;
  save();
  try {
    await runInkRepl({
      api,
      env: { ...input.env, GAMEDEV_PLAY_WORKBENCH: '1' },
      io: { stdin: process.stdin, stdout: process.stdout },
      browserOnly: true,
      entryMode: journal.launch?.mode,
      suggestedSlug: journal.launch?.mode === 'home' ? findCheckout(journal.cwd)?.slug : undefined,
      currentPath: input.entry,
      token: journal.token ?? null,
      ...start,
      login: input.login,
      onReady: (url) => {
        journal.url = url;
        save();
      },
      onCheckpoint: (state) => {
        Object.assign(journal, state);
        save();
      },
    });
    journal.ended = true;
  } finally {
    delete journal.url;
    delete journal.pid;
    save();
  }
}
