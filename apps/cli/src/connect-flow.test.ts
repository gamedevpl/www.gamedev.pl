import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { connectSession } from './connect-flow.js';
import { handleReplLine } from './repl.js';
import { checkoutGame } from './checkout.js';

const dirs: string[] = [];
const directory = () => {
  const dir = mkdtempSync(join(tmpdir(), 'connect-flow-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const source = directory();
  mkdirSync(join(source, 'games', 'sky'), { recursive: true });
  writeFileSync(join(source, 'games', 'sky', 'SPEC.md'), 'A game to build');
  const archive = execFileSync('tar', ['-czf', '-', '-C', source, '.']);
  const fetch = vi.fn(async (url: string) => {
    if (url.includes('/workspace')) return new Response(new Uint8Array(archive));
    const body = url.includes('/api/me/studio?')
      ? { games: [{ slug: 'sky', token: 'tok' }] }
      : url.endsWith('/versions')
        ? { versions: [] }
        : { slug: 'sky', status: 'dispatched', builder: 'self' };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  });
  const api = createApi({
    origin: 'https://example.test',
    store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
    fetch,
  });
  return { api, fetch };
}

describe('interactive game connection', () => {
  it('opens choices without contacting MCP or starting an agent when cancelled', async () => {
    const { api, fetch } = fixture();
    const pick = vi.fn(async () => '');
    expect(
      await connectSession({ api, slug: 'sky', env: { PATH: '' }, pick, abort: { current: null }, write: () => {} }),
    ).toBeNull();
    expect(pick.mock.calls.length).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('enters chat for the selected game without minting MCP credentials', async () => {
    const { api, fetch } = fixture();
    const result = await connectSession({
      api,
      slug: 'sky',
      env: { PATH: '' },
      pick: async () => 'Continue chatting about this game',
      abort: { current: null },
      write: () => {},
    });
    expect(result).toMatchObject({ slug: 'sky', token: 'tok', conversationId: '' });
    expect(fetch.mock.calls.every(([url]) => !url.includes('/connect'))).toBe(true);
  });

  it('downloads an undelivered game and switches the active REPL workshop', async () => {
    const { api, fetch } = fixture();
    const dest = join(directory(), 'sky');
    const result = await handleReplLine({
      line: `/checkout sky ${dest}`,
      api,
      token: null,
      env: { PATH: '' },
      write: () => {},
    });
    expect(result).toMatchObject({
      slug: 'sky',
      token: 'tok',
      workshop: { root: dest, slug: 'sky', token: 'tok', builder: 'self' },
    });
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/workspace?allowUndelivered=true'))).toBe(true);
    expect(readFileSync(join(dest, 'games', 'sky', 'SPEC.md'), 'utf8')).toBe('A game to build');
    const again = await handleReplLine({
      line: '/checkout',
      api,
      token: 'tok',
      workshop: result.workshop,
      write: () => {},
    });
    expect(again.workshop?.root).toBe(dest);
    expect(fetch.mock.calls.filter(([url]) => url.includes('/workspace'))).toHaveLength(1);
  });

  it('uses the remote session game instead of another checkout in the working directory', async () => {
    const { api } = fixture();
    const parent = directory();
    const other = join(parent, 'other');
    mkdirSync(other);
    writeFileSync(join(other, '.gamedev-slug'), 'other');
    vi.spyOn(process, 'cwd').mockReturnValue(other);
    const result = await handleReplLine({ line: '/checkout', api, token: 'tok', env: { PATH: '' }, write: () => {} });
    expect(result.workshop).toMatchObject({ slug: 'sky', root: join(parent, 'sky') });
    expect(readFileSync(join(other, '.gamedev-slug'), 'utf8')).toBe('other');
  });

  it('refuses an occupied destination before downloading or modifying it', async () => {
    const { api, fetch } = fixture();
    const dest = directory();
    writeFileSync(join(dest, 'mine.ts'), 'local edits');
    await expect(checkoutGame({ api, slug: 'sky', dest })).rejects.toThrow('not empty');
    expect(fetch).not.toHaveBeenCalled();
    expect(readFileSync(join(dest, 'mine.ts'), 'utf8')).toBe('local edits');
  });
});
