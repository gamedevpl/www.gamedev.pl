import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeTarGz } from '../platform/tar.js';
import {
  createArchiveSeedContextSource,
  MAX_SEED_CONTEXT_BYTES,
  MAX_SEED_CONTEXT_FILE_BYTES,
  SEED_CONTEXT_BREAKER_COOLDOWN_MS,
} from './seed-context.js';

afterEach(() => vi.useRealTimers());

const catalog = [{ slug: 'test', title: 'Test', genre: 'puzzle' }];
const base = { repo: 'test/repo', ref: 'sha', token: 'unused', getCatalog: async () => catalog };
const files = [
  { path: 'root/shared/game-kit.d.ts', content: 'interface GameKit {}' },
  { path: 'root/games/test/SPEC.md', content: '# Test' },
  { path: 'root/games/test/game.ts', content: 'export {};' },
  { path: 'root/games/test/game/nested/model.ts', content: 'export const value = 1;' },
  { path: 'root/games/test/EDITOR.json', content: '{"version":2}' },
];

function header(path: string, size: number): Buffer {
  const block = Buffer.alloc(512);
  block.write(path);
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12);
  block.write('0', 156);
  return block;
}

function streamedResponse(source: AsyncIterable<Uint8Array>): Response {
  return new Response(Readable.toWeb(Readable.from(source).pipe(createGzip())) as ReadableStream<Uint8Array>);
}

describe('seed context memory bounds', () => {
  it('never decodes reports, media or unrelated game files', async () => {
    const report = 'ą'.repeat(MAX_SEED_CONTEXT_FILE_BYTES);
    const response = writeTarGz([
      ...files,
      ...[
        'media/visual-review/states.json',
        'media/metadata.json',
        'media/capture.ts',
        'review/report.json',
        'AGENT.json',
        'EDITOR.ts',
      ].map((path) => ({ path: `root/games/test/${path}`, content: report })),
    ]);
    const original = Buffer.prototype.toString;
    const decoded: number[] = [];
    const spy = vi.spyOn(Buffer.prototype, 'toString').mockImplementation(function (this: Buffer, ...args) {
      decoded.push(this.length);
      return original.apply(this, args);
    });
    try {
      const context = await createArchiveSeedContextSource({
        ...base,
        fetchImpl: async () => new Response(response),
      }).load();
      expect(context?.kitDeclaration).toBe('interface GameKit {}');
      expect(context?.renderReferences(['test'], 10000)).toContain('game/nested/model.ts');
      expect(context?.renderReferences(['test'], 10000)).toContain('EDITOR.json');
      expect(Math.max(...decoded)).toBeLessThan(1000);
    } finally {
      spy.mockRestore();
    }
  });

  it('opens the circuit before reading an oversized file and probes once after cooldown', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let attempts = 0;
    const warn = vi.fn();
    const source = createArchiveSeedContextSource({
      ...base,
      log: { warn, info: vi.fn() },
      fetchImpl: async () => {
        attempts += 1;
        if (attempts > 1) return new Response(writeTarGz(files));
        return streamedResponse(
          (async function* () {
            yield header('root/shared/game-kit.d.ts', MAX_SEED_CONTEXT_FILE_BYTES + 1);
            yield Buffer.alloc(1024);
          })(),
        );
      },
    });
    expect(await source.load()).toBeNull();
    expect(warn.mock.calls[0][0].err.message).toContain('exceeds');
    expect(await source.load()).toBeNull();
    expect(attempts).toBe(1);
    vi.setSystemTime(Date.now() + SEED_CONTEXT_BREAKER_COOLDOWN_MS);
    expect(await source.load()).not.toBeNull();
    expect(attempts).toBe(2);
    vi.useRealTimers();
  });

  it('fails open when individually bounded source files exceed the total budget', async () => {
    const warn = vi.fn();
    const source = createArchiveSeedContextSource({
      ...base,
      log: { warn, info: vi.fn() },
      fetchImpl: async () =>
        streamedResponse(
          (async function* () {
            const body = Buffer.alloc(MAX_SEED_CONTEXT_FILE_BYTES);
            for (let i = 0; i <= MAX_SEED_CONTEXT_BYTES / body.length; i += 1) {
              yield header(`root/games/test/game/file${i}.ts`, body.length);
              yield body;
            }
            yield Buffer.alloc(1024);
          })(),
        ),
    });
    expect(await source.load()).toBeNull();
    expect(warn.mock.calls[0][0].err.message).toContain('retained bytes');
  });
});
