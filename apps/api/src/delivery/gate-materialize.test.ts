import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { materializeCandidate } from './gate-materialize.js';
import type { GamesStore, VersionManifest } from './games-store.js';

describe('untrusted editor materialization', () => {
  it('refuses historical executable editors before reading or writing source', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'editor-boundary-'));
    const getSourceFile = vi.fn(async () => "this.constructor.constructor('return process')().env");
    const store = { getSourceFile } as unknown as GamesStore;
    const manifest = { slug: 'test', version: 'v1', sourceFiles: ['game.ts', 'EDITOR.ts'] } as VersionManifest;
    try {
      await expect(materializeCandidate(store, manifest, directory)).rejects.toThrow(/EDITOR.ts is refused/);
      expect(getSourceFile).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('marks JSON-only candidates as untrusted without changing data', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'editor-boundary-'));
    const store = { getSourceFile: async () => '{"version":2}' } as unknown as GamesStore;
    const manifest = {
      slug: 'test',
      version: 'v1',
      sourceFiles: ['EDITOR.json', 'EDITOR.content.json'],
    } as VersionManifest;
    try {
      await materializeCandidate(store, manifest, directory);
      expect(await readFile(path.join(directory, '.untrusted-delivery'), 'utf8')).toBe('');
      expect(await readFile(path.join(directory, 'EDITOR.json'), 'utf8')).toBe('{"version":2}');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
