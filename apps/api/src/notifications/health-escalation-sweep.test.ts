import { describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { CatalogGameEntry, GitHubClient, LinkedPullRequest } from '../catalog/github-client.js';
import type { InternalAuthVerifier } from '../platform/internal-auth.js';
import { InMemoryStore } from '../platform/store.js';

// Proves escalation reaches real notifications, not just resolveHealthVerdict's return.

const secret = 'submission-secret';
const acceptAll: InternalAuthVerifier = { verify: async () => true };

function publishedGithubClient(): GitHubClient {
  const mergedPr: LinkedPullRequest = {
    number: 5,
    state: 'MERGED',
    merged: true,
    isDraft: false,
    titleHasWip: false,
    headRefName: 'agent/sky',
    changedFiles: ['games/sky-dodge/index.html'],
  };
  const catalog: CatalogGameEntry[] = [
    {
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      genre: 'arcade',
      controls: 'arrows',
      status: 'published',
      media: null,
      multiplayer: null,
      orientation: 'any',
      submittedBy: null,
    },
  ];
  return {
    getIssueState: async () => ({ state: 'open' }),
    findLinkedPR: async () => mergedPr,
    getGameSources: async () => null,
    getGameMedia: async () => null,
    getCatalog: async () => catalog,
  };
}

async function sweep(app: Awaited<ReturnType<typeof buildApp>>) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/internal/notify-sweep',
    headers: { authorization: 'Bearer scheduler-token' },
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe('health re-gate escalation, end to end through the notify sweep', () => {
  it('pages the operator again for a still-red version once a cooldown window has passed', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.upsertUser({ uid: 'g:creator' });
    await store.createSubmission(1_000_042, 'g:creator', 'Sky Dodge');
    await store.setSubmissionPublishedAt(1_000_042, '2026-07-01T00:00:00.000Z');
    await store.setPublication({
      slug: 'sky-dodge',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-07-01T00:00:00.000Z',
    });

    let health: { green: boolean; ranAt: string } = { green: false, ranAt: '2026-07-01T00:00:00.000Z' };
    const gamesStore = {
      getManifest: async () => ({
        slug: 'sky-dodge',
        version: 'v1',
        createdAt: '2026-06-30T00:00:00.000Z',
        jobId: 1_000_042,
        sourceFiles: [],
        health: { ...health, report: 'trace diverged' },
      }),
    } as unknown as GamesStore;

    const app = await buildApp({
      store,
      sessionSecret: 'dev-session-secret-change-me',
      adminUids: 'g:boss',
      submissionRoutes: {
        githubToken: 'token',
        submissionTokenSecret: secret,
        gamesRepo: 'gamedevpl/www.gamedev.pl-games',
        githubClient: publishedGithubClient(),
        internalAuthVerifier: acceptAll,
        agentChannel: { gamesStore },
      },
    });

    // First re-gate request, resolved red.
    await store.setPublicationHealthCheck('sky-dodge', { version: 'v1', requestedAt: '2026-07-01T00:00:00.000Z' });
    expect(await sweep(app)).toMatchObject({ healthResolved: 1, unhealthy: 1 });

    // A second re-gate request for the same version, past the cooldown.
    const check = (await store.getPublication('sky-dodge'))?.healthCheck;
    health = { green: false, ranAt: '2026-07-16T00:00:00.000Z' };
    await store.setPublicationHealthCheck('sky-dodge', {
      version: 'v1',
      requestedAt: '2026-07-16T00:00:00.000Z',
      unhealthySinceAt: check?.unhealthySinceAt,
    });
    expect(await sweep(app)).toMatchObject({ healthResolved: 1, unhealthy: 1 });

    const operatorAlerts = (await store.listNotifications('g:boss')).filter(
      (notification) => notification.type === 'operator.game_unhealthy',
    );
    expect(operatorAlerts).toHaveLength(2);
    expect(new Set(operatorAlerts.map((n) => n.id)).size).toBe(2);

    await app.close();
  });
});
