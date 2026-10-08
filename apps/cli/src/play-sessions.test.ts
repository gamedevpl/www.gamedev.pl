import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { listPlaySessions, previewKey, selectPlaySessions } from './play-sessions.js';
import { stopPlaySession } from './play.js';
import { runCli } from './main.js';
import { playSessionCommand } from './play-session-command.js';
import { PassThrough } from 'node:stream';
import { EXIT_GREEN, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { handleReplLine } from './repl.js';
import type { ApiClient } from './api.js';

let root: string;
const servers: Server[] = [];
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'play-inventory-'));
  for (const key of ['TMPDIR', 'TMP', 'TEMP']) vi.stubEnv(key, root);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  rmSync(root, { recursive: true, force: true });
});

function checkout(name: string, slug = 'robot') {
  const path = join(root, name);
  mkdirSync(path);
  writeFileSync(join(path, '.gamedev-slug'), slug);
  return path;
}

async function fixture(
  cwd: string,
  options: { kind?: 'workbench' | 'preview'; legacy?: boolean; refuse?: boolean; slug?: string } = {},
) {
  const slug = options.slug ?? 'robot',
    kind = options.kind ?? 'preview';
  const key =
    kind === 'preview'
      ? previewKey(cwd, slug)
      : createHash('sha256')
          .update(cwd + slug)
          .digest('hex');
  const token = 'a'.repeat(kind === 'preview' ? 48 : 64);
  const base = kind === 'preview' ? `/${token}/` : '/';
  let stopped = false,
    stops = 0;
  const server = createServer((req, res) => {
    if (kind === 'workbench' && req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end();
      return;
    }
    if (req.method === 'POST' && req.url === `${base}stop`) {
      if (kind === 'preview') expect(req.headers.origin).toBe(new URL(url).origin);
      stops++;
      if (options.refuse) {
        res.writeHead(403).end();
        return;
      }
      stopped = true;
      res.end('stopped');
      return;
    }
    if (stopped) {
      res.writeHead(503).end();
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(kind === 'preview' ? { key } : { version: 1 }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}${base}${kind === 'workbench' ? `#${token}` : ''}`;
  const dir = join(root, `gamedev-${kind === 'preview' ? 'play' : 'workbench'}-${process.getuid?.() ?? 'user'}`);
  mkdirSync(dir, { mode: 0o700, recursive: true });
  const statePath = join(dir, `${key}.json`);
  const state =
    kind === 'preview'
      ? { url, key, ...(options.legacy ? {} : { root: cwd, slug }) }
      : { url, version: 1, cwd, instance: key, slug, pid: 99999999 };
  writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  return {
    url,
    key,
    statePath,
    state,
    stopped: () => stopped,
    stops: () => stops,
    id: `${kind === 'preview' ? 'p' : 'w'}-${key}`,
  };
}

function streams() {
  const stdin = new PassThrough(),
    stdout = new PassThrough(),
    stderr = new PassThrough();
  let out = '',
    err = '';
  stdout.on('data', (chunk) => {
    out += chunk.toString();
  });
  stderr.on('data', (chunk) => {
    err += chunk.toString();
  });
  return { io: { stdin, stdout, stderr } as unknown as Parameters<typeof runCli>[2], out: () => out, err: () => err };
}

it('lists live workbenches, previews and legacy previews in text and JSON without stopping or opening', async () => {
  const cwd = checkout('first');
  const a = await fixture(cwd),
    b = await fixture(cwd, { kind: 'workbench' });
  const legacy = await fixture(checkout('legacy'), { legacy: true });
  const text = streams();
  expect(await runCli(['node', 'cli', 'play', '--list'], {}, text.io)).toBe(EXIT_GREEN);
  expect(text.out()).toContain(cwd);
  expect(text.out()).toContain(a.url);
  expect(text.out()).toContain(b.id.slice(0, 14));
  expect(text.out()).toContain('older CLI: directory unavailable');
  const json = streams();
  expect(await runCli(['node', 'cli', 'play', '--list', '--json'], {}, json.io)).toBe(EXIT_GREEN);
  expect(JSON.parse(json.out()).sessions).toHaveLength(3);
  expect([a, b, legacy].map((s) => s.stops())).toEqual([0, 0, 0]);
});

it('default stop targets the current checkout, including its workbench and legacy preview, while keeping sibling copies', async () => {
  const cwd = checkout('first');
  mkdirSync(join(cwd, 'nested'));
  const preview = await fixture(cwd, { legacy: true }),
    workbench = await fixture(cwd, { kind: 'workbench' });
  const other = await fixture(checkout('first-copy'));
  const kill = vi.spyOn(process, 'kill');
  expect(await stopPlaySession({ cwd: join(cwd, 'nested'), write: vi.fn() })).toBe(true);
  expect([preview.stopped(), workbench.stopped(), other.stopped()]).toEqual([true, true, false]);
  expect(kill).not.toHaveBeenCalled();
  expect(JSON.parse(readFileSync(workbench.statePath, 'utf8'))).toMatchObject({ ended: true });
  expect(JSON.parse(readFileSync(workbench.statePath, 'utf8'))).not.toHaveProperty('pid');
});

it('refuses an ambiguous slug before stopping anything, then stops one session by ID from elsewhere', async () => {
  const a = await fixture(checkout('first')),
    b = await fixture(checkout('second'));
  const out = streams();
  expect(await runCli(['node', 'cli', 'play', '--stop', 'robot'], {}, out.io)).toBe(EXIT_REFUSED);
  expect(out.err()).toContain(a.id.slice(0, 14));
  expect([a.stops(), b.stops()]).toEqual([0, 0]);
  const selected = streams();
  expect(await runCli(['node', 'cli', 'stop', '--session', a.id.slice(0, 14), '--json'], {}, selected.io)).toBe(
    EXIT_GREEN,
  );
  expect(JSON.parse(selected.out())).toEqual({ stopped: true });
  expect([a.stopped(), b.stopped()]).toEqual([true, false]);
});

it('stops all kinds and legacy records explicitly and reports partial failure while continuing', async () => {
  const a = await fixture(checkout('first'), { refuse: true }),
    b = await fixture(checkout('second'), { kind: 'workbench' });
  const c = await fixture(checkout('third'), { legacy: true });
  const out = streams();
  expect(await runCli(['node', 'cli', 'play', '--stop', '--all'], {}, out.io)).toBe(EXIT_REFUSED);
  expect(out.err()).toContain('refused stop (403)');
  expect([a.stopped(), b.stopped(), c.stopped()]).toEqual([false, true, true]);
  expect((await listPlaySessions()).map((s) => s.id)).toEqual([a.id]);
});

it('ignores stale, malformed, unsafe and non-loopback records without trusting their PIDs', async () => {
  const valid = await fixture(checkout('first'), { kind: 'workbench' });
  const base = join(root, `gamedev-workbench-${process.getuid?.() ?? 'user'}`);
  const write = (key: string, value: unknown) =>
    writeFileSync(join(base, `${key.repeat(64)}.json`), JSON.stringify(value), { mode: 0o600 });
  write('b', { ...valid.state, url: 'http://example.test/#' + 'a'.repeat(64) });
  write('c', { ...valid.state, url: 'http://127.0.0.1:1/#' + 'a'.repeat(64) });
  write('d', { ...valid.state, checkout: { root: 123 } });
  writeFileSync(join(base, 'e'.repeat(64) + '.json'), 'broken', { mode: 0o600 });
  symlinkSync(valid.statePath, join(base, 'f'.repeat(64) + '.json'));
  const kill = vi.spyOn(process, 'kill');
  expect((await listPlaySessions()).map((s) => s.id)).toEqual([valid.id]);
  expect(kill).not.toHaveBeenCalled();
});

it('shows inventory on ordinary play and on stop from an unrelated directory without stopping it', async () => {
  const session = await fixture(checkout('first'));
  const write = vi.fn();
  expect(await playSessionCommand({ verb: 'play', args: [], flags: {}, cwd: root, write })).toBe(false);
  expect(write).toHaveBeenCalledWith(expect.stringContaining(session.url));
  expect(await stopPlaySession({ cwd: root, write })).toBe(false);
  expect(session.stops()).toBe(0);
});

it.each([
  ['play', '--stop', '--all', 'robot'],
  ['play', '--stop', '--session'],
  ['play', '--stop', '--session='],
  ['play', '--list=invalid'],
  ['play', '--session', 'p-aaaaaaaa'],
  ['play', '--list', '--stop'],
  ['stop', 'robot', 'other'],
])('rejects conflicting or incomplete targets: %j', async (...args) => {
  const session = await fixture(checkout('first'));
  expect(await runCli(['node', 'cli', ...args], {}, streams().io)).toBe(EXIT_INPUT);
  expect(session.stops()).toBe(0);
});

it('requires a longer ID when short prefixes collide', () => {
  const a = {
    id: 'p-aaaaaaaaaaaa' + 'b'.repeat(52),
    key: 'x',
    kind: 'preview' as const,
    url: 'http://127.0.0.1/',
    cwd: root,
  };
  const b = { ...a, id: 'p-aaaaaaaaaaaa' + 'c'.repeat(52) };
  expect(() => selectPlaySessions([a, b], { cwd: root, session: a.id.slice(0, 14) })).toThrow('ambiguous');
  expect(selectPlaySessions([a, b], { cwd: root, session: a.id })).toEqual([a]);
});

it('lists and stops all through slash commands without a platform status request', async () => {
  const a = await fixture(checkout('first')),
    b = await fixture(checkout('second'), { kind: 'workbench' });
  const request = vi.fn(),
    write = vi.fn();
  const input = {
    api: { origin: 'https://example.test', request } as unknown as ApiClient,
    token: 'unused',
    cwd: root,
    write,
  };
  await handleReplLine({ ...input, line: '/play --list' });
  expect(write).toHaveBeenCalledWith(expect.stringContaining(a.url));
  expect([a.stops(), b.stops()]).toEqual([0, 0]);
  await handleReplLine({ ...input, line: '/play --stop --all' });
  expect([a.stopped(), b.stopped()]).toEqual([true, true]);
  expect(request).not.toHaveBeenCalled();
});

it('does not broaden a default stop to another game launched in the same directory', async () => {
  const cwd = checkout('first');
  const a = await fixture(cwd),
    b = await fixture(cwd, { kind: 'workbench', slug: 'other-game' });
  expect(await stopPlaySession({ cwd, write: vi.fn() })).toBe(true);
  expect([a.stopped(), b.stopped()]).toEqual([true, false]);
});
