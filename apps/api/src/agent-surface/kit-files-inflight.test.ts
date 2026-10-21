import { describe, expect, it } from 'vitest';
import type { GcsObjectStore } from '../delivery/gcs-sign.js';
import { createKitFileStore } from './kit-files.js';
import { KIT_TEST_ENGINE as ENGINE, KIT_TEST_SHA as SHA, kitTarball } from './kit-files.fixture.js';

describe('createKitFileStore in-flight loads', () => {
  it('coalesces concurrent cold loads into one tarball read', async () => {
    const tgz = kitTarball({ 'SKILL.md': '# hi\n' });
    let tgzReads = 0;
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
        if (name.endsWith('.tgz')) tgzReads += 1;
        return objects.get(name) ?? null;
      },
      objectExists: async (name) => objects.has(name),
      signReadUrl: async () => 'https://signed.example/kit.tgz',
    };
    const kits = createKitFileStore(store);
    const trees = await Promise.all(Array.from({ length: 8 }, () => kits.loadCurrentTree()));
    expect(tgzReads).toBe(1);
    expect(new Set(trees).size).toBe(1);
  });
});
