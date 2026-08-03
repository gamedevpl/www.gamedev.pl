import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { GcsObjectStore } from './gcs-sign.js';
import {
  KIT_READ_MAX_BYTES,
  createKitFileStore,
  kitFileKind,
  listKitFiles,
  normalizeKitPath,
  readKitFile,
  readKitFileFragment,
  searchKitFiles,
  type KitTree,
  KitFilesError,
} from './kit-files.js';
import { KIT_ROOT_DIR } from './kit-registry.js';

const BLOCK = 512;
const ENGINE = 'deadbeef0123456789abcdef0123456789abcdef';
const SHA = 'a'.repeat(64);

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

function kitTarball(files: Record<string, Buffer | string>): Buffer {
  const entries = Object.entries(files).map(([name, body]) =>
    entryBlocks(name.startsWith(`${KIT_ROOT_DIR}/`) ? name : `${KIT_ROOT_DIR}/${name}`, body),
  );
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(BLOCK * 2)]));
}

function treeFrom(files: Record<string, Buffer | string>): KitTree {
  const map = new Map<string, Buffer>();
  for (const [name, body] of Object.entries(files)) {
    const path = name.startsWith(`${KIT_ROOT_DIR}/`) ? name : `${KIT_ROOT_DIR}/${name}`;
    map.set(path, Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8'));
  }
  return { engineRef: ENGINE, sha256: SHA, files: map };
}

describe('normalizeKitPath', () => {
  it('accepts root-relative and kit-rooted paths; rejects traversal', () => {
    expect(normalizeKitPath('SKILL.md')).toBe(`${KIT_ROOT_DIR}/SKILL.md`);
    expect(normalizeKitPath(`${KIT_ROOT_DIR}/SKILL.md`)).toBe(`${KIT_ROOT_DIR}/SKILL.md`);
    expect(normalizeKitPath('shared/modules/core.ts')).toBe(`${KIT_ROOT_DIR}/shared/modules/core.ts`);
    expect(() => normalizeKitPath('../etc/passwd')).toThrow(KitFilesError);
    expect(() => normalizeKitPath('/abs')).toThrow(KitFilesError);
  });
});

describe('kit file ops', () => {
  const tree = treeFrom({
    'SKILL.md': '# Creator Kit\n\nStart here.\nUse GameKit.createCanvasGame.\n',
    'kit.json': JSON.stringify({ engineRef: ENGINE }),
    'shared/modules/core.ts': 'export const core = 1;\n// GameKit.createCanvasGame helper\n',
    'shared/audio/beep.wav': Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]),
    'templates/game/game.ts': 'export {}\n',
  });

  it('lists with prefix and glob', () => {
    const all = listKitFiles(tree, { limit: 10 });
    expect(all.total).toBe(5);
    expect(all.entry).toBe(`${KIT_ROOT_DIR}/SKILL.md`);
    expect(all.files.map((f) => f.path)).toContain(`${KIT_ROOT_DIR}/shared/audio/beep.wav`);
    expect(all.files.find((f) => f.path.endsWith('beep.wav'))?.kind).toBe('binary');

    const shared = listKitFiles(tree, { prefix: 'shared' });
    expect(shared.files.every((f) => f.path.includes('/shared/'))).toBe(true);

    const skills = listKitFiles(tree, { glob: '**/SKILL.md' });
    expect(skills.files.map((f) => f.path)).toEqual([`${KIT_ROOT_DIR}/SKILL.md`]);

    // `?` is literal, not a single-char wildcard / regex quantifier.
    expect(listKitFiles(tree, { glob: 'SKILL.m?' }).files).toHaveLength(0);
    expect(listKitFiles(tree, { glob: 'SKILL.md' }).files).toHaveLength(1);
  });

  it('treats non-finite limit/offset as absent (keeps caps)', () => {
    const tree = treeFrom({
      'a.md': 'one\n',
      'b.md': 'two\n',
      'c.md': 'one again\n',
    });
    const listed = listKitFiles(tree, { limit: Number.NaN, offset: Number.POSITIVE_INFINITY });
    expect(listed.files.length).toBe(3);
    const hits = searchKitFiles(tree, { query: 'one', limit: Number.NaN });
    expect(hits.matches.length).toBeLessThanOrEqual(40);
  });

  it('searches text files and skips binaries', () => {
    const hits = searchKitFiles(tree, { query: 'createCanvasGame' });
    expect(hits.matches.length).toBeGreaterThanOrEqual(2);
    expect(hits.matches.every((m) => !m.path.endsWith('.wav'))).toBe(true);
    expect(() => searchKitFiles(tree, { query: 'x' })).toThrow(/2–120/);
  });

  it('reads small text files and refuses oversized / binary-as-utf8', () => {
    const skill = readKitFile(tree, 'SKILL.md');
    expect(skill.encoding).toBe('utf8');
    expect(skill.content).toMatch(/Creator Kit/);

    expect(() => readKitFile(tree, 'shared/audio/beep.wav', { encoding: 'utf8' })).toThrow(/binary/);
    const wav = readKitFile(tree, 'shared/audio/beep.wav', { encoding: 'base64' });
    expect(wav.encoding).toBe('base64');

    const big = treeFrom({
      'huge.md': 'x'.repeat(KIT_READ_MAX_BYTES + 1),
    });
    expect(() => readKitFile(big, 'huge.md')).toThrow(/read_kit_file_fragment/);
  });

  it('reads line and byte fragments', () => {
    const lines = readKitFileFragment(tree, 'SKILL.md', { unit: 'lines', offset: 0, limit: 2 });
    expect(lines.content.split('\n')).toHaveLength(2);
    expect(lines.totalLines).toBeGreaterThan(2);
    expect(lines.eof).toBe(false);

    const rest = readKitFileFragment(tree, 'SKILL.md', {
      unit: 'lines',
      offset: 0,
      limit: lines.totalLines ?? 99,
    });
    expect(rest.eof).toBe(true);

    const bytes = readKitFileFragment(tree, 'shared/audio/beep.wav', {
      unit: 'bytes',
      offset: 0,
      limit: 4,
      encoding: 'base64',
    });
    expect(Buffer.from(bytes.content, 'base64').toString('ascii')).toBe('RIFF');
  });

  it('classifies by extension and NUL probe', () => {
    expect(kitFileKind('a.ts', Buffer.from('export {}'))).toBe('text');
    expect(kitFileKind('a.wav', Buffer.from('not-really'))).toBe('binary');
    expect(kitFileKind('a.binish', Buffer.from([1, 0, 2]))).toBe('binary');
  });
});

describe('createKitFileStore', () => {
  it('unpacks the current kit tarball once and serves from cache', async () => {
    const tgz = kitTarball({
      'SKILL.md': '# hi\n',
      'kit.json': '{"engineRef":"x"}',
    });
    let reads = 0;
    const objects = new Map<string, Buffer>([
      [
        'kits/current.json',
        Buffer.from(JSON.stringify({ current: ENGINE, previous: null, updatedAt: '2026-08-03T00:00:00.000Z' })),
      ],
      [`kits/${ENGINE}.json`, Buffer.from(JSON.stringify({ sha256: SHA }))],
      [`kits/${ENGINE}.tgz`, tgz],
    ]);
    const store: GcsObjectStore = {
      readObject: async (name) => {
        reads += 1;
        return objects.get(name) ?? null;
      },
      objectExists: async (name) => objects.has(name),
      signReadUrl: async () => 'https://signed.example/kit.tgz',
    };
    const kits = createKitFileStore(store);
    const first = await kits.loadCurrentTree();
    const second = await kits.loadCurrentTree();
    expect(first.files.get(`${KIT_ROOT_DIR}/SKILL.md`)?.toString('utf8')).toBe('# hi\n');
    expect(second).toBe(first);
    // registry+sidecar on each loadCurrentTree, but tarball only once
    expect(reads).toBe(5); // 2+2 registry/sidecar + 1 tgz
  });
});
