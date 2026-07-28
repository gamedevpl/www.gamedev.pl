import { describe, expect, it } from 'vitest';
import { readTarEntries, type TarEntry } from './tar.js';

const BLOCK = 512;

interface FixtureEntry {
  name: string;
  body?: string;
  type?: string;
  prefix?: string;
  ustar?: boolean;
}

/** Builds a tar header + padded body, the way `git archive` would. */
function entryBlocks({ name, body = '', type = '0', prefix = '', ustar = true }: FixtureEntry): Buffer {
  const header = Buffer.alloc(BLOCK);
  header.write(name, 0, 100, 'utf8');
  header.write('000644 \0', 100, 8, 'utf8');
  header.write(`${Buffer.byteLength(body).toString(8).padStart(11, '0')} `, 124, 12, 'utf8');
  header.write(type, 156, 1, 'utf8');
  if (ustar) {
    header.write('ustar\0', 257, 6, 'utf8');
    header.write('00', 263, 2, 'utf8');
    header.write(prefix, 345, 155, 'utf8');
  }

  const payload = Buffer.from(body, 'utf8');
  const padding = Buffer.alloc((BLOCK - (payload.length % BLOCK)) % BLOCK);
  return Buffer.concat([header, payload, padding]);
}

function archive(...entries: FixtureEntry[]): Buffer {
  return Buffer.concat([...entries.map(entryBlocks), Buffer.alloc(BLOCK * 2)]);
}

/** Feeds the parser one chunk, or several of a fixed size. */
async function* stream(buffer: Buffer, chunkSize = buffer.length): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    yield buffer.subarray(offset, offset + chunkSize);
  }
}

async function collect(source: AsyncIterable<Uint8Array>, options?: Parameters<typeof readTarEntries>[1]) {
  const entries: TarEntry[] = [];
  for await (const entry of readTarEntries(source, options)) {
    entries.push(entry);
  }
  return entries;
}

function text(entry: TarEntry): string {
  return Buffer.from(entry.bytes).toString('utf8');
}

describe('readTarEntries', () => {
  it('reads files and their bytes', async () => {
    const entries = await collect(
      stream(
        archive(
          { name: 'repo-abc123/catalog.json', body: '{"games":[]}' },
          { name: 'repo-abc123/games/pong/game.ts', body: 'export const x = 1;' },
        ),
      ),
    );

    expect(entries.map((entry) => entry.path)).toEqual(['repo-abc123/catalog.json', 'repo-abc123/games/pong/game.ts']);
    expect(text(entries[0])).toBe('{"games":[]}');
    expect(text(entries[1])).toBe('export const x = 1;');
  });

  it('rejoins a long path split across the ustar prefix field', async () => {
    const prefix = 'www.gamedev.pl-games-3f8a1c9d2b7e4506a1b2c3d4e5f60718293a4b5c/games/space-treasure-hunter/media';
    const entries = await collect(stream(archive({ name: 'screenshot-opening.png', prefix, body: 'PNG' })));

    expect(entries[0].path).toBe(`${prefix}/screenshot-opening.png`);
  });

  it('honours a pax path record over the header name', async () => {
    const longPath = `repo-abc123/games/${'x'.repeat(120)}/game.ts`;
    const record = `${`path=${longPath}\n`.length + 4} path=${longPath}\n`;
    const entries = await collect(
      stream(
        archive(
          { name: 'repo-abc123/PaxHeader/game.ts', body: record, type: 'x' },
          { name: 'repo-abc123/games/truncated/game.ts', body: 'const a = 1;' },
        ),
      ),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe(longPath);
    expect(text(entries[0])).toBe('const a = 1;');
  });

  it('honours a GNU long name over the header name', async () => {
    const longPath = `repo-abc123/games/${'y'.repeat(130)}/style.css`;
    const entries = await collect(
      stream(
        archive(
          { name: '././@LongLink', body: `${longPath}\0`, type: 'L' },
          { name: 'repo-abc123/games/truncated/style.css', body: 'body{}' },
        ),
      ),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe(longPath);
  });

  it('skips directories, symlinks and global pax headers', async () => {
    const entries = await collect(
      stream(
        archive(
          { name: 'repo-abc123/games/', type: '5' },
          { name: 'repo-abc123/link', type: '2' },
          { name: 'pax_global_header', body: 'comment=abc\n', type: 'g' },
          { name: 'repo-abc123/games/pong/style.css', body: 'body{}' },
        ),
      ),
    );

    expect(entries.map((entry) => entry.path)).toEqual(['repo-abc123/games/pong/style.css']);
  });

  it('keeps only what include asks for', async () => {
    const entries = await collect(
      stream(
        archive(
          { name: 'repo-abc123/tools/validate.ts', body: 'huge' },
          { name: 'repo-abc123/games/pong/game.ts', body: 'kept' },
        ),
      ),
      { include: (path) => path.includes('/games/') },
    );

    expect(entries.map((entry) => entry.path)).toEqual(['repo-abc123/games/pong/game.ts']);
  });

  it('reassembles entries split across chunk boundaries', async () => {
    const body = 'a'.repeat(1500);
    const buffer = archive(
      { name: 'repo-abc123/games/pong/game.ts', body },
      { name: 'repo-abc123/games/pong/style.css', body: 'body{}' },
    );

    // 37 is deliberately hostile: no chunk aligns to a 512-byte block.
    const entries = await collect(stream(buffer, 37));
    expect(entries.map((entry) => entry.path)).toEqual([
      'repo-abc123/games/pong/game.ts',
      'repo-abc123/games/pong/style.css',
    ]);
    expect(text(entries[0])).toBe(body);
  });

  it('stops at the end-of-archive marker and ignores what follows', async () => {
    const buffer = Buffer.concat([
      archive({ name: 'repo-abc123/games/pong/game.ts', body: 'kept' }),
      entryBlocks({ name: 'repo-abc123/games/after-the-end/game.ts', body: 'ignored' }),
    ]);

    const entries = await collect(stream(buffer));
    expect(entries.map((entry) => entry.path)).toEqual(['repo-abc123/games/pong/game.ts']);
  });

  it('refuses to retain more than maxTotalBytes', async () => {
    const buffer = archive({ name: 'repo-abc123/games/pong/media/gameplay.mp4', body: 'z'.repeat(4096) });

    await expect(collect(stream(buffer), { maxTotalBytes: 1024 })).rejects.toThrow(/exceeds 1024 retained bytes/);
  });
});
