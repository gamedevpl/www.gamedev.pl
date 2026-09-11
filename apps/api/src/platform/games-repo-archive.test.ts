import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { fetchGamesRepoArchive } from './games-repo-archive.js';

const BLOCK = 512;
const ROOT = 'gamedevpl-www.gamedev.pl-games-3f8a1c9';

/** One tar entry, the way `git archive` writes it. */
function entryBlocks(name: string, body: Buffer | string, type = '0'): Buffer {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const header = Buffer.alloc(BLOCK);
  header.write(name, 0, 100, 'utf8');
  header.write(`${payload.length.toString(8).padStart(11, '0')} `, 124, 12, 'utf8');
  header.write(type, 156, 1, 'utf8');
  header.write('ustar\0', 257, 6, 'utf8');
  const padding = Buffer.alloc((BLOCK - (payload.length % BLOCK)) % BLOCK);
  return Buffer.concat([header, payload, padding]);
}

function tarball(files: Record<string, Buffer | string>): Buffer {
  const entries = Object.entries(files).map(([name, body]) => entryBlocks(`${ROOT}/${name}`, body));
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(BLOCK * 2)]));
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

const REPO_FILES = {
  'catalog.json': '[{"slug":"pong"}]',
  'games/pong/game.ts': 'export const speed = 3;',
  'games/pong/media/opening.png': PNG_BYTES,
  'shared/modules/core.ts': 'export const core = 1;',
  'tools/validate.ts': 'const MAX_BUNDLE_BYTES = 1;',
  'docs/notes.md': '# notes',
};

const BASE = { repo: 'gamedevpl/www.gamedev.pl-games', ref: 'main', token: 't' };

function createFetch(body: Buffer, init: ResponseInit = {}): typeof fetch {
  return (async () => new Response(body, init)) as unknown as typeof fetch;
}

describe('fetchGamesRepoArchive', () => {
  it('downloads the whole repo in a single request', async () => {
    const fetchImpl = vi.fn(async () => new Response(tarball(REPO_FILES)));

    await fetchGamesRepoArchive({ ...BASE, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      'https://api.github.com/repos/gamedevpl/www.gamedev.pl-games/tarball/main',
    );
  });

  it('reads text and bytes at repo-relative paths, with the archive root stripped', async () => {
    const archive = await fetchGamesRepoArchive({ ...BASE, fetchImpl: createFetch(tarball(REPO_FILES)) });

    await expect(archive.readText('games/pong/game.ts', 'main')).resolves.toBe('export const speed = 3;');
    await expect(archive.readText('catalog.json', 'main')).resolves.toBe('[{"slug":"pong"}]');
    expect(Buffer.from((await archive.readBytes('games/pong/media/opening.png', 'main')) ?? [])).toEqual(PNG_BYTES);
  });

  it('answers null for a file the ref does not have — the same as a 404 read', async () => {
    const archive = await fetchGamesRepoArchive({ ...BASE, fetchImpl: createFetch(tarball(REPO_FILES)) });

    await expect(archive.readText('games/absent/game.ts', 'main')).resolves.toBeNull();
    await expect(archive.readBytes('games/absent/media/opening.png', 'main')).resolves.toBeNull();
  });

  it('keeps only what serving needs', async () => {
    const archive = await fetchGamesRepoArchive({ ...BASE, fetchImpl: createFetch(tarball(REPO_FILES)) });

    // tools/ and docs/ are most of the repo by file count and none of it by use.
    expect(archive.fileCount).toBe(4);
    await expect(archive.readText('tools/validate.ts', 'main')).resolves.toBeNull();
  });

  it('refuses to answer for a ref it does not hold', async () => {
    const archive = await fetchGamesRepoArchive({ ...BASE, fetchImpl: createFetch(tarball(REPO_FILES)) });

    // Otherwise a PR preview would be quietly served files baked from main.
    await expect(archive.readText('games/pong/game.ts', 'some-pr-branch')).rejects.toThrow(/holds main, not/);
  });

  it('throws when the archive cannot be downloaded, so the caller can fall back', async () => {
    const fetchImpl = createFetch(Buffer.from('{"message":"API rate limit exceeded"}'), {
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(fetchGamesRepoArchive({ ...BASE, fetchImpl })).rejects.toThrow(/cannot download .* \(403 Forbidden\)/);
  });
});
