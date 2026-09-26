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
