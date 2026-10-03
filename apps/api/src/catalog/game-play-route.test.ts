import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from './github-client.js';
import { registerGamePlayRoute } from './game-play-route.js';

describe('published game errors', () => {
  it('does not expose source errors in responses', async () => {
    const leakedValue = 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA';
    const app = Fastify({ logger: false });
    const githubClient = {
      getGameSources: vi.fn().mockRejectedValue(new Error(`forbidden import: ${leakedValue}`)),
    } as unknown as GitHubClient;

    await registerGamePlayRoute(app, {
      githubClient,
      publishedRef: 'main',
      now: () => 1,
      catalog: {
        storePublishedGame: async () => null,
        isSlugPublished: async () => true,
        readSnapshotGame: async () => null,
      },
      draftPreview: {
        canPlayDraft: async () => null,
        replyWithDraft: async (_request, reply) => reply,
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/games/bubble-pop' });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: 'failed to load game' });
    expect(response.body).not.toContain(leakedValue);
    await app.close();
  });
});

it('identifies actual served HTML consistently across publication lanes', async () => {
  const run = async (lane: 'store' | 'snapshot') => {
    const app = Fastify({ logger: false });
    const game = { slug: 'space-hop', title: 'Space Hop', html: '<html>same artifact</html>' };
    await registerGamePlayRoute(app, {
      githubClient: {} as GitHubClient,
      snapshotReader: lane === 'snapshot' ? ({} as never) : null,
      publishedRef: 'main',
      now: () => 1,
      catalog: {
        storePublishedGame: async () => (lane === 'store' ? game : null),
        isSlugPublished: async () => true,
        readSnapshotGame: async () => game,
      },
      draftPreview: { canPlayDraft: async () => null, replyWithDraft: async (_, reply) => reply },
    });
    const res = await app.inject({ method: 'GET', url: '/api/games/space-hop' });
    const body = res.json() as { artifactVersion: string };
    expect(res.statusCode).toBe(200);
    expect(body.artifactVersion).toMatch(/^[a-f0-9]{64}$/);
    await app.close();
    return body.artifactVersion;
  };
  expect(await run('store')).toBe(await run('snapshot'));
});
