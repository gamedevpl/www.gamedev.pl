import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { recoverCheckout } from './recover.js';
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
      new Response(JSON.stringify(url.endsWith('/recovery') ? { kind } : { accepted: true, slug: 'sky' })),
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
  await recoverCheckout({ ...f, slug: 'new-sky' });
  const next = join(f.cwd, '../new-sky-recovered');
  expect(readFileSync(join(f.cwd, '.gamedev-slug'), 'utf8')).toBe('sky');
  expect(readFileSync(join(f.cwd, '.gamedev-base.json'), 'utf8')).toBe('old-base');
  expect(readFileSync(join(next, '.gamedev-slug'), 'utf8')).toBe('new-sky\n');
  expect(readFileSync(join(next, 'games/new-sky/SPEC.md'), 'utf8')).toContain('slug: new-sky');
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
it('clears a definitive slug refusal so a different destination can be chosen', async () => {
  const f = fixture();
  const original = f.fetch.getMockImplementation()!;
  f.fetch.mockImplementation(async (url) =>
    url.endsWith('/recover')
      ? new Response(JSON.stringify({ error: 'slug_unavailable' }), { status: 409 })
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
