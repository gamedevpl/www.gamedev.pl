import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import type { ApiClient } from './api.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { submitCommand } from './submit-command.js';
import { runCli } from './main.js';
import { handleReplLine } from './repl.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const close of cleanup.splice(0)) close();
});

function stream(tty = false) {
  const io = new PassThrough();
  Object.assign(io, { isTTY: tty, columns: 100 });
  let text = '';
  io.on('data', (chunk: Buffer) => (text += chunk.toString()));
  cleanup.push(() => io.destroy());
  return { io: io as unknown as NodeJS.WriteStream, read: () => text };
}

function fixture() {
  const dest = mkdtempSync(join(tmpdir(), 'gdpl-push-progress-'));
  cleanup.push(() => rmSync(dest, { recursive: true, force: true }));
  const slug = 'push-progress';
  const files = [{ path: 'game.ts', content: 'old' }];
  writeGameFiles(dest, slug, files);
  writeBase(dest, 'v1', files);
  writeFileSync(join(dest, '.gamedev-slug'), slug);
  writeFileSync(join(dest, 'games', slug, 'game.ts'), 'new');
  const messages: string[] = [];
  const reply = (path: string, body?: unknown): unknown => {
    messages.push(path);
    if (path.endsWith('/versions')) return { versions: [{ version: 'v1', sourceFiles: ['game.ts'] }] };
    if (path.includes('/tree')) return { version: 'v1', files };
    if (path.endsWith('/sources/session')) return { locked: false };
    if (path.endsWith('/sources')) return { files };
    if (path.endsWith('/sources/stage')) {
      expect(body).toEqual({ path: 'game.ts', content: 'new' });
      return { accepted: true };
    }
    if (path.endsWith('/sources/deliver')) return { accepted: true, version: 'v2', gateStarted: true };
    throw Error(`Unexpected request ${path}`);
  };
  const api: ApiClient = {
    origin: 'https://www.gamedev.pl',
    request: async <T>(_method: string, path: string, body?: unknown) => reply(path, body) as T,
    requestBytes: async () => Buffer.alloc(0),
  };
  const stdout = stream();
  const stderr = stream(true);
  return { dest, slug, api, stdout, stderr, messages, reply, io: { stdout: stdout.io, stderr: stderr.io } };
}

it('warns about a stale GameKit pin before sending', async () => {
  const f = fixture();
  const local = 'a'.repeat(40);
  const current = 'b'.repeat(40);
  writeFileSync(join(f.dest, 'gamedev.lock'), JSON.stringify({ engineRef: local }));
  writeFileSync(join(f.dest, 'check.cjs'), 'process.exit(0)\n');
  writeFileSync(
    join(f.dest, 'package.json'),
    JSON.stringify({ scripts: { typecheck: 'node check.cjs', 'check:static': 'node check.cjs' } }),
  );
  const previous = f.reply;
  f.api.request = async <T>(_method: string, path: string, body?: unknown) => {
    if (path.endsWith('/workspace?kitOnly=true')) return { engineRef: current } as T;
    return previous(path, body) as T;
  };
  await submitCommand({ delivery: { ...f, publish: false }, io: f.io, asJson: false });
  const err = f.stderr.read();
  const warning = err.indexOf('gamedevpl kit update');
  const sending = err.indexOf('[7/8] Sending preview');
  expect(warning).toBeGreaterThan(-1);
  expect(err).toContain(local.slice(0, 12));
  expect(err).toContain(current.slice(0, 12));
  expect(sending).toBeGreaterThan(warning);
});

it.each([false, true])('numbers delivery stages during real local checks (publish=%s)', async (publish) => {
  const f = fixture();
  writeFileSync(join(f.dest, 'check.cjs'), 'setTimeout(() => process.exit(0), 1200)\n');
  writeFileSync(
    join(f.dest, 'package.json'),
    JSON.stringify({
      scripts: {
        typecheck: 'node check.cjs',
        'check:static': 'node -e "process.exit(0)"',
        'check:game': 'node -e "process.exit(0)"',
      },
    }),
  );
  const pending = submitCommand({ delivery: { ...f, publish }, io: f.io, asJson: false });
  expect(f.stderr.read()).toContain('[1/8] Checking platform sources');
  await vi.waitFor(() => expect(f.stderr.read()).toContain('npm run typecheck'));
  expect(f.stdout.read()).toBe('');
  await vi.waitFor(() => expect(f.stderr.read()).toContain('(1s)'), { timeout: 3000 });
  await pending;
  const checks = publish ? 3 : 2;
  expect(f.stderr.read()).toContain(`[2/8] Checking local game 1/${checks}: npm run typecheck`);
  expect(f.stderr.read()).toContain(`[2/8] Checking local game 2/${checks}: npm run check:static`);
  if (publish) expect(f.stderr.read()).toContain('[2/8] Checking local game 3/3: npm run check:game');
  expect(f.stderr.read()).toContain('[3/8] Rechecking platform sources');
  expect(f.stderr.read()).toContain('[4/8] Preparing delivery session');
  expect(f.stderr.read()).toContain('[5/8] Checking staged files');
  expect(f.stderr.read()).toContain('[6/8] Uploading file 1/1: game.ts');
  expect(f.stderr.read()).toContain(
    `[7/8] Sending ${publish ? 'publish' : 'preview'} — waiting for platform acceptance`,
  );
  expect(f.stderr.read()).toContain('[8/8] Delivery accepted — updating local checkout');
  expect(f.stderr.read().endsWith('\r\u001b[2K')).toBe(true);
  expect(f.stdout.read()).toContain(`delivery accepted push-progress @ v2 (${publish ? 'publish' : 'preview'})`);
  expect(f.stdout.read()).toContain('not published');
});

it('shows numbered plain-text progress when publishing unchanged sources', async () => {
  const f = fixture();
  writeFileSync(join(f.dest, 'games', f.slug, 'game.ts'), 'old');
  const stderr = stream();
  await submitCommand({
    delivery: { ...f, publish: true, run: () => ({ status: 0, stderr: '' }) },
    io: { stdout: f.stdout.io, stderr: stderr.io },
    asJson: false,
  });
  const lines = stderr.read().trim().split('\n');
  expect(lines.map((line) => line.match(/^\[(\d)\/8\]/)?.[1])).toEqual([
    '1',
    '2',
    '2',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
  ]);
  expect(stderr.read()).toContain('[6/8] No changed files to upload');
  expect(stderr.read()).not.toContain('\u001b');
  expect(f.messages.some((path) => path.endsWith('/sources/stage'))).toBe(false);
  expect(f.stdout.read()).toContain('delivery accepted push-progress @ v2 (publish)');
});

it('clears progress after a red check and never uploads the failed sources', async () => {
  vi.useFakeTimers();
  const f = fixture();
  await expect(
    submitCommand({
      delivery: { ...f, run: () => ({ status: 1, stderr: 'types failed' }) },
      io: f.io,
      asJson: false,
    }),
  ).rejects.toThrow('types failed');
  expect(f.messages.some((path) => path.includes('/sources'))).toBe(false);
  expect(f.stderr.read().endsWith('\r\u001b[2K')).toBe(true);
  expect(f.stdout.read()).toBe('');
  const last = f.stderr.read();
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.stderr.read()).toBe(last);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps JSON delivery output machine readable without progress', async () => {
  const f = fixture();
  await submitCommand({ delivery: { ...f, run: () => ({ status: 0, stderr: '' }) }, io: f.io, asJson: true });
  expect(JSON.parse(f.stdout.read())).toMatchObject({ kind: 'delivered', mode: 'preview', version: 'v2' });
  expect(f.stderr.read()).toBe('');
});

it.each(['SIGINT', 'SIGTERM', 'SIGHUP'] as const)(
  'stops the local check on %s and releases the checkout',
  async (signal) => {
    const f = fixture();
    const listeners = process.listenerCount(signal);
    writeFileSync(
      join(f.dest, 'check.cjs'),
      "require('fs').writeFileSync('checking', 'yes'); setInterval(() => {}, 1000)\n",
    );
    writeFileSync(
      join(f.dest, 'package.json'),
      JSON.stringify({ scripts: { typecheck: 'node check.cjs', 'check:static': 'node -e "process.exit(0)"' } }),
    );
    const pending = submitCommand({ delivery: f, io: f.io, asJson: false });
    const stopped = expect(pending).rejects.toThrow('Delivery stopped');
    await vi.waitFor(() => expect(readFileSync(join(f.dest, 'checking'), 'utf8')).toBe('yes'), { timeout: 3000 });
    process.emit(signal);
    await stopped;
    expect(process.listenerCount(signal)).toBe(listeners);
    expect(f.stderr.read().endsWith('\r\u001b[2K')).toBe(true);
    expect(f.messages.some((path) => path.includes('/sources'))).toBe(false);
    await submitCommand({ delivery: { ...f, run: () => ({ status: 0, stderr: '' }) }, io: f.io, asJson: false });
    expect(f.stdout.read()).toContain('delivery accepted');
  },
);

it.each(['push', 'submit'])('shows progress immediately for the shell %s verb while the API waits', async (verb) => {
  vi.useFakeTimers();
  const f = fixture();
  writeFileSync(join(f.dest, 'games', f.slug, 'game.ts'), 'old');
  let resolve: (value: Response) => void = () => {};
  vi.stubGlobal('fetch', (url: string) =>
    url.endsWith('/versions')
      ? new Promise<Response>((done) => (resolve = done))
      : Promise.resolve(new Response(JSON.stringify(f.reply(new URL(url).pathname)))),
  );
  const stdin = new PassThrough();
  cleanup.push(() => stdin.destroy());
  const pending = runCli(['node', 'gamedevpl', verb, f.dest], { GAMEDEV_TOKEN: 'test-token' }, { ...f.io, stdin });
  await vi.advanceTimersByTimeAsync(0);
  expect(f.stderr.read()).toContain('Checking platform sources');
  expect(f.stdout.read()).toBe('');
  await vi.advanceTimersByTimeAsync(1100);
  expect(f.stderr.read()).toContain('(1s)');
  resolve(new Response(JSON.stringify(f.reply('/versions'))));
  expect(await pending).toBe(0);
  expect(f.stdout.read()).toContain('nothing to deliver');
  expect(readFileSync(join(f.dest, 'games', f.slug, 'game.ts'), 'utf8')).toBe('old');
  expect(vi.getTimerCount()).toBe(0);
});

function shellPublicationFixture(checkGameFails = false) {
  const f = fixture();
  writeFileSync(
    join(f.dest, 'check.cjs'),
    `const fs = require('fs');
fs.appendFileSync('checks.jsonl', JSON.stringify(process.argv.slice(2)) + '\\n');
if (${checkGameFails} && process.argv[2] === 'check:game') process.exit(1);
`,
  );
  writeFileSync(
    join(f.dest, 'package.json'),
    JSON.stringify({
      scripts: Object.fromEntries(
        ['typecheck', 'check:static', 'check:game'].map((stage) => [stage, `node check.cjs ${stage}`]),
      ),
    }),
  );
  const deliveries: unknown[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.endsWith('/sources/deliver')) deliveries.push(body);
    return new Response(JSON.stringify(f.reply(new URL(url).pathname, body)));
  });
  const stdin = new PassThrough();
  cleanup.push(() => stdin.destroy());
  const run = (args: string[]) =>
    runCli(
      ['node', 'gamedevpl', args[0]!, f.dest, ...args.slice(1), '--json'],
      { GAMEDEV_TOKEN: 'test-token' },
      {
        ...f.io,
        stdin,
      },
    );
  const checks = () =>
    readFileSync(join(f.dest, 'checks.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
  return { ...f, deliveries, run, checks };
}

it.each([['push', '--publish'], ['publish'], ['publish', '--publish=false']])(
  'runs full slug-specific checks and submits a publication candidate for %s %s',
  async (...args) => {
    const f = shellPublicationFixture();
    expect(await f.run(args)).toBe(0);
    expect(f.checks()).toEqual(['typecheck', 'check:static', 'check:game'].map((stage) => [stage, f.slug]));
    expect(f.deliveries).toEqual([expect.objectContaining({ mode: 'publish' })]);
    expect(JSON.parse(f.stdout.read())).toMatchObject({ kind: 'delivered', mode: 'publish', version: 'v2' });
  },
);

it('does not upload or deliver through shell publish when the publication check fails', async () => {
  const f = shellPublicationFixture(true);
  expect(await f.run(['publish'])).toBe(1);
  expect(f.checks()).toEqual(['typecheck', 'check:static', 'check:game'].map((stage) => [stage, f.slug]));
  expect(f.messages.some((path) => path.includes('/sources'))).toBe(false);
  expect(f.deliveries).toEqual([]);
  expect(f.stderr.read()).toContain('verify failed at check_game');
});

it.each(['/push', '/submit'])('cancels %s through the shared controller and keeps the session usable', async (line) => {
  const f = fixture();
  const abort = { current: null as AbortController | null };
  const lines: string[] = [];
  writeFileSync(
    join(f.dest, 'check.cjs'),
    "require('fs').writeFileSync('checking', 'yes'); setInterval(() => {}, 1000)\n",
  );
  writeFileSync(
    join(f.dest, 'package.json'),
    JSON.stringify({ scripts: { typecheck: 'node check.cjs', 'check:static': 'node -e "process.exit(0)"' } }),
  );
  const input = { line, api: f.api, token: null, cwd: f.dest, abort, write: (text: string) => lines.push(text) };
  const pending = handleReplLine(input);
  await vi.waitFor(() => expect(readFileSync(join(f.dest, 'checking'), 'utf8')).toBe('yes'), { timeout: 3000 });
  expect(abort.current).not.toBeNull();
  abort.current!.abort();
  expect(await pending).toMatchObject({ next: 'continue' });
  expect(abort.current).toBeNull();
  expect(f.messages.some((path) => path.includes('/sources'))).toBe(false);
  expect(lines.join('\n')).toContain('aborted');
  expect(readFileSync(join(f.dest, 'games', f.slug, 'game.ts'), 'utf8')).toBe('new');
  writeFileSync(join(f.dest, 'check.cjs'), 'process.exit(0)\n');
  expect(await handleReplLine(input)).toMatchObject({ next: 'continue' });
  expect(abort.current).toBeNull();
  expect(lines.join('\n')).toContain('delivery accepted');
});

it('cancels a pending interactive API request through the shared controller', async () => {
  const f = fixture();
  const abort = { current: null as AbortController | null };
  let requestSignal: AbortSignal | undefined;
  f.api.request = (_method, _path, _body, signal) =>
    new Promise((_resolve, reject) => {
      requestSignal = signal;
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  const pending = handleReplLine({
    line: '/push',
    api: f.api,
    token: null,
    cwd: f.dest,
    abort,
    write: () => {},
  });
  await vi.waitFor(() => expect(requestSignal).toBeDefined());
  expect(requestSignal).toBe(abort.current!.signal);
  abort.current!.abort();
  expect(await pending).toMatchObject({ next: 'continue' });
  expect(abort.current).toBeNull();
});
