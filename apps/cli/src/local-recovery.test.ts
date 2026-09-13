import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { handleReplLine } from './repl.js';
import { connectSession } from './connect-flow.js';
import { matchingCheckout, replStart } from './local-recovery.js';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
function fixture(kind = 'missing') {
  const parent = mkdtempSync(join(tmpdir(), 'recover space '));
  dirs.push(parent);
  const root = join(parent, 'sky');
  mkdirSync(join(root, 'games', 'sky'), { recursive: true });
  writeFileSync(join(root, '.gamedev-slug'), 'sky');
  writeFileSync(join(root, '.gamedev-base.json'), JSON.stringify({ version: 'undelivered', files: {} }));
  writeFileSync(
    join(root, 'games/sky/SPEC.md'),
    '---\ntitle: Sky Game\nslug: sky\n---\nA very fun game with islands and puzzles.',
  );
  writeFileSync(join(root, 'games/sky/game.ts'), 'unsent local edits');
  let active = kind === 'active';
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    let body: unknown = {};
    if (url.includes('/studio?'))
      body = { games: active || kind === 'archived' || kind === 'published' ? [{ slug: 'sky', token: 'round' }] : [] };
    else if (url.endsWith('/recovery')) body = { kind: active ? 'active' : kind === 'published' ? 'occupied' : kind };
    else if (url.endsWith('/recover')) {
      active = true;
      body = { token: 'round', slug: 'sky' };
    } else if (url.endsWith('/versions')) body = { versions: [] };
    else if (url.endsWith('/sources/session')) body = { jobId: 2, generation: 0, locked: false };
    else if (url.endsWith('/sources/stage')) body = { accepted: true };
    else if (url.includes('/api/submissions/')) body = { slug: 'sky', builder: 'self', status: 'queued' };
    else if (init?.method && init.method !== 'GET') throw new Error(`Unexpected mutation: ${url}`);
    return new Response(JSON.stringify(body));
  });
  const api = createApi({
    origin: 'https://test.example',
    store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
    fetch,
  });
  return {
    parent,
    root,
    api,
    fetch,
    write: vi.fn(),
    env: { PATH: '' },
    abort: { current: null },
    pick: vi.fn(async () => 'Recover and continue'),
  };
}
it.each(['missing', 'canceled', 'archived'])(
  'starts in a %s checkout and recovers into the same local session',
  async (kind) => {
    const f = fixture(kind);
    const start = await replStart(f.api, join(f.root, 'games/sky'));
    expect(start).toMatchObject({ token: null, checkout: { root: f.root }, initialLine: '/checkout sky' });
    const result = await handleReplLine({
      ...f,
      token: start.token,
      cwd: start.checkout!.root,
      line: start.initialLine!,
    });
    expect(result).toMatchObject({ token: 'round', workshop: { root: f.root, slug: 'sky', builder: 'self' } });
    expect(f.pick).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(f.root, 'games/sky/game.ts'), 'utf8')).toBe('unsent local edits');
    const writes = f.fetch.mock.calls
      .filter(([, init]) => init?.method !== 'GET')
      .map(([url]) => new URL(url).pathname);
    expect(writes).toEqual([
      '/api/me/studio/recover',
      '/api/me/studio/games/sky/sources/stage',
      '/api/me/studio/games/sky/sources/stage',
    ]);
  },
);
it('connects from the parent directory without a second mode || agent prompt', async () => {
  const f = fixture();
  expect(matchingCheckout(f.parent, 'sky')?.root).toBe(f.root);
  const result = await connectSession({ ...f, cwd: f.parent, slug: 'sky', agent: 'codex' });
  expect(result).toMatchObject({ token: 'round', workshop: { root: f.root, selectedAgent: 'codex' } });
  expect(f.pick).toHaveBeenCalledTimes(1);
});
it.each(['', 'Keep files and return'])('keeps the orphan context after cancellation (%s)', async (choice) => {
  const f = fixture();
  f.pick.mockResolvedValue(choice);
  const result = await handleReplLine({ ...f, token: null, cwd: f.root, line: '/connect' });
  expect(result.token).toBeUndefined();
  expect(existsSync(join(f.root, '.gamedev-recovery.json'))).toBe(false);
  f.fetch.mockClear();
  await handleReplLine({ ...f, token: null, cwd: f.root, line: 'Improve my game' });
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.write).toHaveBeenLastCalledWith(expect.stringContaining('/recover'));
});
it.each([401, 403, 503])('never offers recovery for HTTP %s', async (status) => {
  const f = fixture();
  f.fetch.mockResolvedValue(new Response(JSON.stringify({ error: 'unavailable' }), { status }));
  await handleReplLine({ ...f, token: null, cwd: f.root, line: '/checkout' });
  expect(f.pick).not.toHaveBeenCalled();
  expect(f.fetch.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
});
it('does not recover an occupied slug', async () => {
  const f = fixture('occupied');
  await handleReplLine({ ...f, token: null, cwd: f.root, line: '/checkout' });
  expect(f.pick).not.toHaveBeenCalled();
  expect(f.fetch.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
});
it('opens healthy checkouts immediately after checking their lifecycle', async () => {
  const f = fixture('active');
  expect(await replStart(f.api, f.root)).toMatchObject({
    token: 'round',
    checkout: { root: f.root },
    initialLine: undefined,
  });
  expect(f.fetch).toHaveBeenCalledTimes(2);
});
it('resumes interrupted staging even when Studio already has the recovered round', async () => {
  const f = fixture();
  const normal = f.fetch.getMockImplementation()!;
  let failed = false;
  f.fetch.mockImplementation(async (url, init) => {
    if (!failed && url.endsWith('/sources/stage')) {
      failed = true;
      return new Response('{"error":"unavailable"}', { status: 503 });
    }
    return normal(url, init);
  });
  await handleReplLine({ ...f, token: null, cwd: f.root, line: '/checkout' });
  expect(existsSync(join(f.root, '.gamedev-recovery.json'))).toBe(true);
  const start = await replStart(f.api, f.root);
  expect(start.token).toBeNull();
  const result = await handleReplLine({ ...f, token: null, cwd: f.root, line: start.initialLine! });
  expect(result.workshop?.root).toBe(f.root);
  expect(existsSync(join(f.root, '.gamedev-recovery.json'))).toBe(false);
  const requests = f.fetch.mock.calls.filter(([url]) => url.endsWith('/recover'));
  expect(JSON.parse(String(requests[0]![1]!.body)).key).toBe(JSON.parse(String(requests[1]![1]!.body)).key);
});
it('does not recover when lifecycle lookup fails despite an existing shelf token', async () => {
  const f = fixture('active');
  const normal = f.fetch.getMockImplementation()!;
  f.fetch.mockImplementation(async (url, init) =>
    url.endsWith('/recovery') ? new Response('{"error":"unavailable"}', { status: 503 }) : normal(url, init),
  );
  await handleReplLine({ ...f, token: null, cwd: f.root, line: '/connect' });
  expect(f.pick).not.toHaveBeenCalled();
  expect(f.fetch.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
});

it('opens owned published games even though recovery reports occupied', async () => {
  const f = fixture('published');
  expect(await replStart(f.api, f.root)).toMatchObject({
    token: 'round',
    checkout: { root: f.root },
    initialLine: undefined,
  });
  const result = await connectSession({ ...f, cwd: f.parent, slug: 'sky', agent: 'codex' });
  expect(result).toMatchObject({ token: 'round', workshop: { root: f.root, selectedAgent: 'codex' } });
  expect(f.pick).not.toHaveBeenCalled();
  expect(f.fetch.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
});
