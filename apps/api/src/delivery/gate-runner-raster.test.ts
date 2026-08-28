import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runGate, type GateRunnerDeps } from './gate-runner.js';
import type { GamesStore } from './games-store.js';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const stubAssemble: NonNullable<GateRunnerDeps['assembleBundle']> = async () => '<!doctype html>assembled';

describe('runGate rasters', () => {
  it('materializes raster sources as file bytes, not UTF-8 text', async () => {
    const harness = await mkdtemp(path.join(tmpdir(), 'gate-'));
    const store = {
      getManifest: async () => ({
        slug: 'comet-courier',
        version: 'v1',
        createdAt: '2026-07-30T10:00:00Z',
        jobId: 1_000_001,
        engineRef: 'abc123',
        sourceFiles: ['game.ts', 'scenes/glade/bg.png'],
      }),
      getSourceFile: async (_slug: string, _version: string, filePath: string) =>
        filePath.endsWith('.png') ? TINY_PNG.toString('base64') : `contents of ${filePath}`,
      putDerivedArtifact: async () => undefined,
      putCandidateSources: vi.fn(),
      putGateResult: vi.fn(),
      getDerivedArtifact: async () => null,
      getKitRegistry: async () => null,
    } as unknown as GamesStore;
    let written: Buffer | null = null;
    const run = vi.fn(async () => {
      written = await readFile(path.join(harness, 'games/comet-courier/scenes/glade/bg.png'));
      return { code: 0, output: 'all good' };
    });

    await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: async () => harness,
      run,
      assembleBundle: stubAssemble,
    });

    expect(written).toEqual(TINY_PNG);
  });
});
