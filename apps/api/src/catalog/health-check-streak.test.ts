import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startHealthCheck, type HealthGateTrigger } from './game-health.js';
import type { GamesStore, VersionManifest } from '../delivery/games-store.js';
import { InMemoryStore } from '../platform/store.js';

// Split out: game-health.test.ts is at its size ceiling.

const NOW = Date.parse('2026-07-30T12:00:00.000Z');

let store: InMemoryStore;
let manifests: Map<string, VersionManifest>;
let gateTrigger: ReturnType<typeof vi.fn>;

const gamesStore = {
  async getManifest(slug: string, version: string) {
    return manifests.get(`${slug}@${version}`) ?? null;
  },
} as unknown as GamesStore;

beforeEach(async () => {
  store = new InMemoryStore();
  manifests = new Map();
  gateTrigger = vi.fn(async () => ({ buildId: 'b-1' }));
  await store.createSubmission(200, 'creator-1', 'comet-courier');
});

const deps = () => ({ store, gamesStore, gateTrigger: gateTrigger as unknown as HealthGateTrigger, now: () => NOW });

describe('startHealthCheck — unhealthySinceAt carry-forward', () => {
  it('carries the streak forward when re-requested against the same version', async () => {
    manifests.set('comet-courier@v1', {
      slug: 'comet-courier',
      version: 'v1',
      jobId: 200,
      createdAt: '',
      sourceFiles: [],
    });
    await store.setPublication({ slug: 'comet-courier', state: 'published', currentVersion: 'v1', publishedAt: '' });
    const publication = {
      slug: 'comet-courier',
      currentVersion: 'v1',
      healthCheck: {
        version: 'v1',
        requestedAt: '2026-07-01T00:00:00.000Z',
        unhealthySinceAt: '2026-07-01T00:00:00.000Z',
      },
    };

    await startHealthCheck(deps(), publication);

    expect((await store.getPublication('comet-courier'))?.healthCheck).toMatchObject({
      unhealthySinceAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('drops the streak when the re-request is for a different, newly published version', async () => {
    manifests.set('comet-courier@v2', {
      slug: 'comet-courier',
      version: 'v2',
      jobId: 200,
      createdAt: '',
      sourceFiles: [],
    });
    await store.setPublication({ slug: 'comet-courier', state: 'published', currentVersion: 'v2', publishedAt: '' });
    const publication = {
      slug: 'comet-courier',
      currentVersion: 'v2',
      healthCheck: {
        version: 'v1',
        requestedAt: '2026-07-01T00:00:00.000Z',
        unhealthySinceAt: '2026-07-01T00:00:00.000Z',
      },
    };

    await startHealthCheck(deps(), publication);

    expect((await store.getPublication('comet-courier'))?.healthCheck?.unhealthySinceAt).toBeUndefined();
  });
});
