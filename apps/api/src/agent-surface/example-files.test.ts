import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { GcsObjectStore } from '../delivery/gcs-sign.js';
import {
  EXAMPLE_READ_MAX_BYTES,
  ExampleFilesError,
  createExampleFileStore,
  exampleRootDir,
  listExampleFiles,
  normalizeExamplePath,
  readExampleFile,
  type ExampleTree,
} from './example-files.js';

/**
 * BY-28a — exemplar sources readable without fetching.
 *
 * `get_example` hands back a signed tarball, which assumes the reader can open a
 * socket. A ChatGPT-side connector cannot, so these are the reads that make the
 * curated exemplars reachable for that client at all.
 */

const BLOCK = 512;
const SLUG = 'block-cascade';
const ROOT = exampleRootDir(SLUG);

function entryBlocks(name: string, body: Buffer | string): Buffer {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const header = Buffer.alloc(BLOCK);
  header.write(name, 0, 100, 'utf8');
  header.write(`${payload.length.toString(8).padStart(11, '0')} `, 124, 12, 'utf8');
  header.write('0', 156, 1, 'utf8');
  header.write('ustar\0', 257, 6, 'utf8');
  const padding = Buffer.alloc((BLOCK - (payload.length % BLOCK)) % BLOCK);
  return Buffer.concat([header, payload, padding]);
}

function exampleTarball(files: Record<string, Buffer | string>): Buffer {
  const entries = Object.entries(files).map(([name, body]) => entryBlocks(name, body));
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(BLOCK * 2)]));
}

function treeFrom(files: Record<string, Buffer | string>): ExampleTree {
  const map = new Map<string, Buffer>();
  for (const [name, body] of Object.entries(files)) {
    map.set(name, Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8'));
  }
  return { slug: SLUG, files: map };
}

function objectStoreWith(objects: Map<string, Buffer>): GcsObjectStore {
  return {
    readObject: async (name) => objects.get(name) ?? null,
    objectExists: async (name) => objects.has(name),
    signReadUrl: async (name) => `https://signed.example/${name}`,
  };
}

describe('example files (BY-28a)', () => {
  it('accepts relative and full paths as the same file, and refuses traversal', () => {
    expect(normalizeExamplePath(SLUG, 'game.ts')).toBe(`${ROOT}/game.ts`);
    expect(normalizeExamplePath(SLUG, `${ROOT}/game.ts`)).toBe(`${ROOT}/game.ts`);
    expect(normalizeExamplePath(SLUG, './SPEC.md')).toBe(`${ROOT}/SPEC.md`);

    // A `..` from an untrusted round is a probe, not a typo — refused, not normalized.
    for (const bad of ['../secret', 'a/../../b', '/etc/passwd', 'a\\b', '']) {
      expect(() => normalizeExamplePath(SLUG, bad), bad).toThrow(ExampleFilesError);
    }
  });

  it('lists files with sizes and kinds, and says when it truncated', () => {
    const tree = treeFrom({
      [`${ROOT}/SPEC.md`]: '# Block Cascade',
      [`${ROOT}/game.ts`]: 'export {};',
      [`${ROOT}/assets/blip.wav`]: Buffer.from([0, 1, 2, 3]),
    });

    const all = listExampleFiles(tree);
    expect(all.slug).toBe(SLUG);
    expect(all.total).toBe(3);
    expect(all.truncated).toBe(false);
    // localeCompare, same ordering rule as the kit listing (case-insensitive, so
    // SPEC.md sorts after the lowercase names rather than before them).
    expect(all.files.map((f) => f.path)).toEqual([`${ROOT}/assets/blip.wav`, `${ROOT}/game.ts`, `${ROOT}/SPEC.md`]);
    expect(all.files.find((f) => f.path.endsWith('.wav'))?.kind).toBe('binary');

    const page = listExampleFiles(tree, { limit: 2 });
    expect(page.files).toHaveLength(2);
    // A caller that believes it saw everything will reason about a game it half read.
    expect(page.truncated).toBe(true);

    const scoped = listExampleFiles(tree, { prefix: 'assets' });
    expect(scoped.files.map((f) => f.path)).toEqual([`${ROOT}/assets/blip.wav`]);
  });

  it('reads text inline, requires base64 for binary, and refuses oversized files', () => {
    const tree = treeFrom({
      [`${ROOT}/game.ts`]: 'export const tick = () => {};',
      [`${ROOT}/assets/blip.wav`]: Buffer.from([1, 2, 3]),
      [`${ROOT}/huge.ts`]: 'x'.repeat(EXAMPLE_READ_MAX_BYTES + 1),
    });

    expect(readExampleFile(tree, 'game.ts')).toMatchObject({
      slug: SLUG,
      path: `${ROOT}/game.ts`,
      kind: 'text',
      encoding: 'utf8',
      content: 'export const tick = () => {};',
    });

    // Binary defaults to base64 rather than mangling bytes into a string.
    expect(readExampleFile(tree, 'assets/blip.wav')).toMatchObject({ kind: 'binary', encoding: 'base64' });
    expect(() => readExampleFile(tree, 'assets/blip.wav', { encoding: 'utf8' })).toThrow(/binary/i);

    expect(() => readExampleFile(tree, 'missing.ts')).toThrow(/no file at/i);
    // Refused, not silently truncated — a half file reads as a whole one.
    expect(() => readExampleFile(tree, 'huge.ts')).toThrow(/max/i);
  });

  it('unpacks a published tarball and caches it', async () => {
    const objects = new Map<string, Buffer>([
      [
        `examples/${SLUG}.tgz`,
        exampleTarball({ [`${ROOT}/SPEC.md`]: '# Block Cascade', [`${ROOT}/game.ts`]: 'export {};' }),
      ],
    ]);
    let reads = 0;
    const store = createExampleFileStore({
      ...objectStoreWith(objects),
      readObject: async (name) => {
        reads += 1;
        return objects.get(name) ?? null;
      },
    });

    const tree = await store.loadTree(SLUG);
    expect([...tree.files.keys()].sort()).toEqual([`${ROOT}/SPEC.md`, `${ROOT}/game.ts`]);
    await store.loadTree(SLUG);
    expect(reads).toBe(1);
  });

  it('drops members outside the exemplar root', async () => {
    // A tool scoped to one slug must not become a reader for whatever else a future
    // packer happens to put in the archive.
    const objects = new Map<string, Buffer>([
      [
        `examples/${SLUG}.tgz`,
        exampleTarball({
          [`${ROOT}/game.ts`]: 'export {};',
          'games/some-other-game/game.ts': 'export const leaked = true;',
          'kits/secret.txt': 'nope',
        }),
      ],
    ]);
    const store = createExampleFileStore(objectStoreWith(objects));

    const tree = await store.loadTree(SLUG);

    expect([...tree.files.keys()]).toEqual([`${ROOT}/game.ts`]);
  });

  it('reports an unpublished exemplar rather than throwing something opaque', async () => {
    const store = createExampleFileStore(objectStoreWith(new Map()));
    await expect(store.loadTree(SLUG)).rejects.toThrow(/no packed sources/i);
  });
});
