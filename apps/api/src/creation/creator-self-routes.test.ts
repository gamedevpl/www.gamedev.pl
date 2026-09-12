import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import type { GitHubClient } from '../catalog/github-client.js';

async function createApp(): Promise<FastifyInstance> {
  const githubClient = { getCatalog: async () => [] } as unknown as GitHubClient;
  return buildApp({
    store: new InMemoryStore(),
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubToken: 'token',
      submissionTokenSecret: 'secret',
      githubClient,
      snapshotReader: null,
    },
  });
}

describe('a guard that sends the rejection itself must leave the handler replying once', () => {
  it('replies exactly once to /api/me/quota with no session', async () => {
    const app = await createApp();
    let sends = 0;
    app.addHook('onSend', async () => {
      sends += 1;
    });

    const res = await app.inject({ method: 'GET', url: '/api/me/quota' });
    expect(res.statusCode).toBe(401);
    expect(sends).toBe(1);

    await app.close();
  });
});
