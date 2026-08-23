import { describe, expect, it } from 'vitest';
import { firstGateScreenshotPath, PLATFORM_CHECK_SHOT_LABEL, postGateScreenshotToThread } from './gate-screenshot.js';
import type { GamesStore } from './games-store.js';
import { InMemoryStore } from '../platform/store.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

describe('gate screenshot posting', () => {
  it('picks opening.png when present, else the first media PNG', () => {
    expect(firstGateScreenshotPath(['bundle.html', 'media/gameplay.mp4', 'media/mid.png', 'media/opening.png'])).toBe(
      'media/opening.png',
    );
    expect(firstGateScreenshotPath(['media/zebra.png', 'media/alpha.png'])).toBe('media/alpha.png');
    expect(firstGateScreenshotPath(['bundle.html', 'preview.html'])).toBeUndefined();
  });

  it('posts the PNG onto the build thread with the platform-check label', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(42, 'g:owner', 'Shot Game');
    const gamesStore = {
      getDerivedArtifact: async (_slug: string, _version: string, name: string) =>
        name === 'media/opening.png' ? PNG : null,
    } as unknown as GamesStore;

    const posted = await postGateScreenshotToThread({
      store,
      gamesStore,
      issueNumber: 42,
      slug: 'shot-game',
      version: 'v1',
      screenshotPath: 'media/opening.png',
    });

    expect(posted?.id).toBeTruthy();
    const shots = await store.listBuildShots(42);
    expect(shots).toHaveLength(1);
    expect(shots[0]?.label).toBe(PLATFORM_CHECK_SHOT_LABEL);
    const full = await store.getBuildShot(42, shots[0]!.id);
    expect(full?.data).toBe(PNG.toString('base64'));
  });

  it('skips non-PNG or missing artifacts rather than failing the reconcile', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(7, 'g:owner', 'Empty');
    const gamesStore = {
      getDerivedArtifact: async () => Buffer.from('not-a-png'),
    } as unknown as GamesStore;

    await expect(
      postGateScreenshotToThread({
        store,
        gamesStore,
        issueNumber: 7,
        slug: 'empty',
        version: 'v1',
        screenshotPath: 'media/opening.png',
      }),
    ).resolves.toBeNull();
    expect(await store.countBuildShots(7)).toBe(0);
  });
});
