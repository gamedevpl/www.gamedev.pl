import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runGate } from './gate-runner.js';
import type { GamesStore, VersionManifest } from './games-store.js';

const manifest: VersionManifest = {
  slug: 'comet-courier',
  version: 'v1',
  createdAt: '2026-07-30T10:00:00Z',
  jobId: 1_000_001,
  engineRef: 'accepted-engine',
  origin: 'editor',
  sourceFiles: ['game.ts'],
};

describe('health gate artifacts', () => {
  it.each([
    { name: 'passing', code: 0, green: true },
    { name: 'failing', code: 1, green: false },
  ])('stores no derived artifacts from a $name health run', async ({ code, green }) => {
    const harness = await mkdtemp(path.join(tmpdir(), 'gate-health-'));
    await mkdir(path.join(harness, 'games/comet-courier/media'), { recursive: true });
    await writeFile(path.join(harness, 'games/comet-courier/media/frame.png'), 'health frame');
    const putDerivedArtifact = vi.fn(async () => undefined);
    const store = {
      getManifest: async () => manifest,
      getSourceFile: async () => 'game source',
      putDerivedArtifact,
      getKitRegistry: async () => null,
    } as unknown as GamesStore;

    const outcome = await runGate(
      manifest.slug,
      manifest.version,
      {
        store,
        prepareHarness: async () => harness,
        run: async (command) =>
          command === 'git' ? { code: 0, output: 'current-engine' } : { code, output: 'check result' },
        assembleBundle: async () => '<!doctype html>current engine output',
      },
      { engineRef: 'main' },
    );

    expect(outcome).toMatchObject({ green, artifacts: [] });
    expect(putDerivedArtifact).not.toHaveBeenCalled();
  });
});
