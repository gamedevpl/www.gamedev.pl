import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { dispatchReadVerb } from './verbs.js';
import { CLI_RELEASES_API } from './update.js';
import { updateProgress } from './update-progress.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const close of cleanup.splice(0)) close();
});
function stream(tty = false) {
  const io = new PassThrough();
  Object.assign(io, { isTTY: tty, columns: 80 });
  let text = '';
  io.on('data', (chunk: Buffer) => {
    text += chunk.toString();
  });
  cleanup.push(() => io.destroy());
  return { io: io as unknown as NodeJS.WriteStream, read: () => text };
}
function fixture(json = false) {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-progress-'));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const stdout = stream();
  const stderr = stream(true);
  const bytes = Buffer.from('#!/usr/bin/env node\n');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const input = {
    verb: 'update',
    args: [],
    flags: { dest: join(root, 'gamedevpl'), json },
    api: createApi({ origin: 'https://www.gamedev.pl', store: memoryStore(null) }),
    io: { stdout: stdout.io, stderr: stderr.io },
  };
  const response = (url: string) => {
    if (url === CLI_RELEASES_API) return new Response(JSON.stringify([{ tag_name: 'cli-v9.0.0' }]));
    if (url.endsWith('SHA256SUMS')) return new Response(`${hash}  gamedevpl\n`);
    if (url.endsWith('/gamedevpl')) return new Response(bytes);
    return new Response('## 9.0.0 — 2026-10-10\n### Fixed\n- Improved updates.');
  };
  return { input, stdout, stderr, response };
}

it('animates immediately during a pending request and clears before printing the result', async () => {
  vi.useFakeTimers();
  const f = fixture();
  let resolve: (value: Response) => void = () => {};
  vi.stubGlobal('fetch', (url: RequestInfo | URL) =>
    String(url) === CLI_RELEASES_API
      ? new Promise<Response>((done) => {
          resolve = done;
        })
      : Promise.resolve(f.response(String(url))),
  );
  const pending = dispatchReadVerb(f.input);
  expect(f.stderr.read()).toContain('Checking CLI releases');
  expect(f.stdout.read()).toBe('');
  const before = f.stderr.read();
  await vi.advanceTimersByTimeAsync(1100);
  expect(f.stderr.read()).not.toBe(before);
  expect(f.stderr.read()).toContain('(1s)');
  resolve(f.response(CLI_RELEASES_API));
  expect(await pending).toBe(0);
  expect(f.stderr.read()).toContain('Downloading gamedevpl 9.0.0');
  expect(f.stderr.read()).toContain('Installing CLI');
  expect(f.stderr.read()).toContain('Loading release notes');
  expect(f.stderr.read().endsWith('\r\u001b[2K')).toBe(true);
  expect(f.stdout.read()).toContain('updated gamedevpl');
  expect(vi.getTimerCount()).toBe(0);
});

it('clears the spinner on failure and stops writing frames', async () => {
  vi.useFakeTimers();
  const f = fixture();
  let reject: (error: Error) => void = () => {};
  vi.stubGlobal(
    'fetch',
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const pending = dispatchReadVerb(f.input);
  const failed = expect(pending).rejects.toThrow('offline');
  reject(new Error('offline'));
  await failed;
  const last = f.stderr.read();
  expect(last.endsWith('\r\u001b[2K')).toBe(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.stderr.read()).toBe(last);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps JSON output to one object without progress on either stream', async () => {
  const f = fixture(true);
  vi.stubGlobal('fetch', (url: RequestInfo | URL) => Promise.resolve(f.response(String(url))));
  expect(await dispatchReadVerb(f.input)).toBe(0);
  expect(JSON.parse(f.stdout.read())).toMatchObject({ version: '9.0.0', asset: 'gamedevpl' });
  expect(f.stderr.read()).toBe('');
});

it('uses plain stage lines in redirected output, and activity callbacks in the REPL', () => {
  const io = stream();
  const plain = updateProgress({ stream: io.io, enabled: true });
  plain.stage('Checking releases');
  plain.stage('Checking releases');
  plain.stage('Downloading CLI');
  plain.stop();
  expect(io.read()).toBe('Checking releases\nDownloading CLI\n');
  const activity = vi.fn();
  const progress = updateProgress({ stream: io.io, enabled: true, activity });
  progress.stage('Installing CLI');
  progress.stop();
  expect(activity).toHaveBeenCalledWith('Installing CLI');
  expect(io.read()).not.toContain('Installing CLI');
});
