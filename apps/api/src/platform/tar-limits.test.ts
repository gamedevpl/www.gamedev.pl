import { describe, expect, it, vi } from 'vitest';
import { readTarEntries } from './tar.js';

function header(path: string, size: number): Buffer {
  const block = Buffer.alloc(512);
  block.write(path);
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12);
  block.write('0', 156);
  return block;
}

describe('tar streaming memory limits', () => {
  it('rejects excessive retained bytes from the header before requesting a body', async () => {
    const bodyRead = vi.fn();
    const source = (async function* () {
      yield header('source.ts', 4096);
      bodyRead();
      yield Buffer.alloc(4096);
    })();
    await expect(readTarEntries(source, { maxTotalBytes: 1024 }).next()).rejects.toThrow('retained bytes');
    expect(bodyRead).not.toHaveBeenCalled();
  });

  it('rejects an excessive individual entry before requesting its body', async () => {
    const bodyRead = vi.fn();
    const source = (async function* () {
      yield header('source.ts', 4096);
      bodyRead();
      yield Buffer.alloc(4096);
    })();
    await expect(readTarEntries(source, { maxTotalBytes: 8192, maxEntryBytes: 1024 }).next()).rejects.toThrow(
      'source.ts exceeds',
    );
    expect(bodyRead).not.toHaveBeenCalled();
  });

  it('discards excluded bodies chunk by chunk without concatenating them', async () => {
    const chunk = Buffer.alloc(512);
    const bodySize = 2 * 1024 * 1024;
    const source = (async function* () {
      yield header('media/states.json', bodySize);
      for (let i = 0; i < bodySize / chunk.length; i += 1) yield chunk;
      yield header('source.ts', 4);
      yield Buffer.from('kept'.padEnd(512, '\0'));
      yield Buffer.alloc(1024);
    })();
    const original = Buffer.concat;
    const concat = vi.spyOn(Buffer, 'concat').mockImplementation((list, length) => {
      expect(length ?? list.reduce((sum, part) => sum + part.length, 0)).toBeLessThanOrEqual(512);
      return original(list, length);
    });
    try {
      const entries = [];
      for await (const entry of readTarEntries(source, { include: (path) => path === 'source.ts', maxTotalBytes: 4 }))
        entries.push(entry);
      expect(entries.map((entry) => entry.path)).toEqual(['source.ts']);
      expect(Buffer.from(entries[0].bytes).toString()).toBe('kept');
    } finally {
      concat.mockRestore();
    }
  });
});
