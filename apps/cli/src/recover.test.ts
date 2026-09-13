import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { handleReplLine } from './repl.js';
import { recoverCheckout } from './recover.js';
import { CliError } from './exit-codes.js';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
function fixture(kind = 'missing') {
  const parent = mkdtempSync(join(tmpdir(), 'recover-'));
  dirs.push(parent);
  const cwd = join(parent, 'sky');
  mkdirSync(join(cwd, 'games', 'sky'), { recursive: true });
  writeFileSync(join(cwd, '.gamedev-slug'), 'sky');
  writeFileSync(join(cwd, '.gamedev-base.json'), 'old-base');
  writeFileSync(join(cwd, 'gamedev.lock'), JSON.stringify({ slug: 'sky', engineRef: 'kit' }));
  writeFileSync(
    join(cwd, 'games', 'sky', 'SPEC.md'),
    '---\ntitle: Sky Game\nslug: sky\n---\nA very fun game with islands and puzzles.',
  );
  writeFileSync(join(cwd, 'games', 'sky', 'game.ts'), 'local edits');
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith('/versions')
            ? { versions: [] }
            : url.endsWith('/sources/session')
              ? { jobId: 2, generation: 0, locked: false }
              : url.endsWith('/recovery')
                ? { kind }
                : { accepted: true, slug: 'sky', token: 'new-round' },
        ),
      ),
  );
  const api = createApi({
    origin: 'https://test.example',
    store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
    fetch,
  });
  return { cwd, api, fetch, write: vi.fn(), yes: true };
}
it.each(['missing', 'canceled'])('recovers %s sources without publishing or replacing local edits', async (kind) => {
  const f = fixture(kind);
  await recoverCheckout(f);
  expect(readFileSync(join(f.cwd, 'games/sky/game.ts'), 'utf8')).toBe('local edits');
  expect(JSON.parse(readFileSync(join(f.cwd, '.gamedev-base.json'), 'utf8'))).toEqual({
    version: 'undelivered',
    files: {},
  });
  expect(f.fetch.mock.calls.some(([url]) => url.includes('/deliver'))).toBe(false);
});
it('preserves metadata and retries using one key when staging fails', async () => {
  const f = fixture();
  const original = f.fetch.getMockImplementation()!;
  let fail = true;
  f.fetch.mockImplementation(async (url) => {
    if (url.endsWith('/sources/stage') && fail)
      return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
    return original(url);
  });
  await expect(recoverCheckout(f)).rejects.toThrow();
  const pending = readFileSync(join(f.cwd, '.gamedev-recovery.json'), 'utf8');
  expect(readFileSync(join(f.cwd, '.gamedev-base.json'), 'utf8')).toBe('old-base');
  fail = false;
  await recoverCheckout(f);
  expect(f.fetch.mock.calls.filter(([url]) => url.endsWith('/recover'))).toHaveLength(2);
  expect(pending).toContain('key');
  expect(existsSync(join(f.cwd, '.gamedev-recovery.json'))).toBe(false);
});
it('copies a changed slug into a new checkout, preserving the original', async () => {
  const f = fixture();
  execFileSync('git', ['init'], { cwd: f.cwd, stdio: 'ignore' });
  execFileSync('git', ['remote', 'add', 'origin', 'gamedevpl::sky'], { cwd: f.cwd });
  await recoverCheckout({ ...f, slug: 'new-sky' });
  const next = join(f.cwd, '../new-sky-recovered');
  expect(readFileSync(join(f.cwd, '.gamedev-slug'), 'utf8')).toBe('sky');
  expect(readFileSync(join(f.cwd, '.gamedev-base.json'), 'utf8')).toBe('old-base');
  expect(readFileSync(join(next, '.gamedev-slug'), 'utf8')).toBe('new-sky\n');
  expect(readFileSync(join(next, 'games/new-sky/SPEC.md'), 'utf8')).toContain('slug: new-sky');
  expect(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: next, encoding: 'utf8' }).trim()).toBe(
    realpathSync(next),
  );
  expect(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: next, encoding: 'utf8' }).trim()).toBe(
    'gamedevpl://new-sky',
  );
  expect(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: f.cwd, encoding: 'utf8' }).trim()).toBe(
    'gamedevpl::sky',
  );
});
it('does not create or modify anything when the slug is occupied or confirmation is absent', async () => {
  const f = fixture('occupied');
  await expect(recoverCheckout(f)).rejects.toThrow('unavailable');
  expect(f.fetch).toHaveBeenCalledTimes(1);
  const free = fixture();
  await recoverCheckout({ ...free, yes: false });
  expect(free.fetch).toHaveBeenCalledTimes(1);
  expect(existsSync(join(free.cwd, '.gamedev-recovery.json'))).toBe(false);
});
it('can retry a failed renamed checkout copy without damaging the source', async () => {
  const f = fixture();
  writeFileSync(join(f.cwd, 'gamedev.lock'), '{broken');
  await expect(recoverCheckout({ ...f, slug: 'other' })).rejects.toThrow();
  expect(existsSync(join(f.cwd, '../other-recovered'))).toBe(false);
  expect(readFileSync(join(f.cwd, '.gamedev-slug'), 'utf8')).toBe('sky');
  writeFileSync(join(f.cwd, 'gamedev.lock'), '{}');
  await recoverCheckout({ ...f, slug: 'other' });
  expect(existsSync(join(f.cwd, '../other-recovered'))).toBe(true);
});
it.each([
  ['slug_unavailable', 409],
  ['recovery_changed', 409],
  ['content_rejected', 422],
])('clears definitive %s refusal with a human-readable message', async (error, status) => {
  const f = fixture();
  const original = f.fetch.getMockImplementation()!;
  f.fetch.mockImplementation(async (url) =>
    url.endsWith('/recover')
      ? new Response(JSON.stringify({ error, message: 'Choose another slug; existing games are never overwritten.' }), {
          status,
        })
      : original(url),
  );
  await expect(recoverCheckout(f)).rejects.toThrow();
  expect(existsSync(join(f.cwd, '.gamedev-recovery.json'))).toBe(false);
});
it('removes staged files deleted locally before retrying', async () => {
  const f = fixture();
  writeFileSync(join(f.cwd, 'games/sky/A.ts'), 'partial upload');
  const original = f.fetch.getMockImplementation()!;
  let fail = true;
  f.fetch.mockImplementation(async (url) => {
    if (url.endsWith('/sources/stage') && fail) throw new Error('connection lost');
    return original(url);
  });
  await expect(recoverCheckout(f)).rejects.toThrow();
  rmSync(join(f.cwd, 'games/sky/A.ts'));
  fail = false;
  await recoverCheckout(f);
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith('/sources/stage/delete'))).toBe(true);
});

it('switches the REPL to the recovered round', async () => {
  const f = fixture('canceled');
  const result = await handleReplLine({
    api: f.api,
    line: `/recover ${f.cwd} --yes`,
    token: 'canceled-round',
    write: f.write,
  });
  expect(result).toMatchObject({
    next: 'continue',
    token: 'new-round',
    slug: 'sky',
    workshop: { root: f.cwd, token: 'new-round', slug: 'sky', builder: 'self' },
  });
});

it.each(['missing', 'occupied'])('measures %s recovery without source data', async (kind) => {
  const f = fixture(kind);
  const telemetry = { record: vi.fn(), flush: async () => {} };
  await recoverCheckout({ ...f, telemetry }).catch(() => {});
  expect(telemetry.record.mock.calls).toEqual([
    ['recovery_attempt'],
    [kind === 'missing' ? 'recovery_succeeded' : 'recovery_failed'],
  ]);
});

it('clears ended recovery state after an interrupted renamed-checkout completion', async () => {
  const f = fixture();
  await recoverCheckout({ ...f, slug: 'other' });
  const dest = join(f.cwd, '../other-recovered');
  const key = readFileSync(join(dest, '.gamedev-import-key'), 'utf8');
  writeFileSync(join(f.cwd, '.gamedev-recovery.json'), JSON.stringify({ slug: 'other', key, origin: f.api.origin }));
  const original = f.fetch.getMockImplementation()!;
  f.fetch.mockImplementation(async (url) =>
    url.endsWith('/recover')
      ? new Response(JSON.stringify({ error: 'recovery_changed', message: 'Run recovery again.' }), { status: 409 })
      : original(url),
  );
  await expect(recoverCheckout({ ...f, slug: 'other' })).rejects.toThrow('Run recovery again');
  expect(existsSync(join(f.cwd, '.gamedev-recovery.json'))).toBe(false);
  expect(readFileSync(join(dest, 'games/other/game.ts'), 'utf8')).toBe('local edits');
});

it('does not count shell inspection as a canceled recovery', async () => {
  const f = fixture();
  const telemetry = { record: vi.fn(), flush: async () => {} };
  await recoverCheckout({ ...f, yes: false, telemetry });
  expect(telemetry.record).not.toHaveBeenCalled();
  await recoverCheckout({ ...f, yes: false, pick: async () => 'Keep files and return', telemetry });
  expect(telemetry.record.mock.calls).toEqual([['recovery_attempt'], ['recovery_canceled']]);
});

it('retires a pending recovery when the destination becomes occupied', async () => {
  const f = fixture('occupied');
  writeFileSync(
    join(f.cwd, '.gamedev-recovery.json'),
    JSON.stringify({
      slug: 'sky',
      origin: f.api.origin,
      key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }),
  );
  await expect(recoverCheckout(f)).rejects.toThrow('unavailable');
  expect(existsSync(join(f.cwd, '.gamedev-recovery.json'))).toBe(false);
  expect(readFileSync(join(f.cwd, 'games/sky/game.ts'), 'utf8')).toBe('local edits');
});
it('names GAME.json instead of reporting a parser error', async () => {
  const f = fixture();
  writeFileSync(join(f.cwd, 'games', 'sky', 'GAME.json'), '{ "title": "Sky Game", }');
  await expect(recoverCheckout(f)).rejects.toThrow(/GAME\.json is not valid JSON/);
});
it('names the pending file when recovery cannot read its own state', async () => {
  const f = fixture();
  writeFileSync(join(f.cwd, '.gamedev-recovery.json'), '{"slug":"sk');
  const caught = await recoverCheckout(f).catch((error: unknown) => error);
  expect(caught).toBeInstanceOf(CliError);
  expect((caught as CliError).message).toContain('.gamedev-recovery.json');
  expect((caught as CliError).next).toContain('delete that file');
});
it('keeps the pending file intact when the scratch path is occupied', async () => {
  const f = fixture();
  const original = f.fetch.getMockImplementation()!;
  f.fetch.mockImplementation(async (url) => {
    if (url.endsWith('/sources/stage')) return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
    return original(url);
  });
  await expect(recoverCheckout(f)).rejects.toThrow();
  const pendingPath = join(f.cwd, '.gamedev-recovery.json');
  const before = readFileSync(pendingPath, 'utf8');
  // Any write that lands would add this path to pending.
  writeFileSync(join(f.cwd, 'games', 'sky', 'extra.ts'), 'added between attempts');
  mkdirSync(`${pendingPath}.${process.pid}.tmp`);
  await expect(recoverCheckout(f)).rejects.toThrow();
  expect(readFileSync(pendingPath, 'utf8')).toBe(before);
  expect(JSON.stringify(JSON.parse(before).paths)).not.toContain('extra.ts');
});
function recoverBody(f: ReturnType<typeof fixture>): { title?: unknown } {
  const call = f.fetch.mock.calls.find(([url]) => url.endsWith('/recover')) as unknown as [string, RequestInit];
  return JSON.parse(String(call[1].body)) as { title?: unknown };
}
it('picks one string when GAME.json localizes the title', async () => {
  const f = fixture();
  writeFileSync(join(f.cwd, 'games', 'sky', 'GAME.json'), JSON.stringify({ title: { en: 'Sky Game', pl: 'Gra Sky' } }));
  await recoverCheckout(f);
  expect(recoverBody(f).title).toBe('Sky Game');
});
it('falls back to SPEC.md when GAME.json carries no usable title', async () => {
  const f = fixture();
  writeFileSync(join(f.cwd, 'games', 'sky', 'GAME.json'), JSON.stringify({ title: {} }));
  await recoverCheckout(f);
  expect(recoverBody(f).title).toBe('Sky Game');
});
it('still takes a plain GAME.json title', async () => {
  const f = fixture();
  writeFileSync(join(f.cwd, 'games', 'sky', 'GAME.json'), JSON.stringify({ title: '  Rolling Marble  ' }));
  await recoverCheckout(f);
  expect(recoverBody(f).title).toBe('Rolling Marble');
});
it('refuses a title the recovery route would reject', async () => {
  const f = fixture();
  writeFileSync(join(f.cwd, 'games', 'sky', 'GAME.json'), JSON.stringify({ title: { en: 'ab' } }));
  await expect(recoverCheckout(f)).rejects.toThrow(/must be 3 to 120 characters/);
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith('/recover'))).toBe(false);
});
it('refuses a pending key the recovery route would reject', async () => {
  const f = fixture();
  writeFileSync(
    join(f.cwd, '.gamedev-recovery.json'),
    JSON.stringify({ slug: 'sky', origin: 'https://test.example', key: '1'.repeat(36) }),
  );
  await expect(recoverCheckout(f)).rejects.toThrow(/pending recovery is unreadable/);
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith('/recover'))).toBe(false);
});
