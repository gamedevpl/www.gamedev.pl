import { describe, expect, it } from 'vitest';
import { buildApp } from './platform/app.js';
import type { GitHubClient } from './catalog/github-client.js';
import { InMemoryStore } from './platform/store.js';
import type { InternalAuthVerifier } from './platform/internal-auth.js';
import type { Mailer } from './notifications/mailer.js';

const secret = 'submission-secret';
const acceptAll: InternalAuthVerifier = { verify: async () => true };

function idleGithubClient(): GitHubClient {
  return {
    getIssueState: async () => ({ state: 'open' }),
    findLinkedPR: async () => null,
    getGameSources: async () => null,
    getGameMedia: async () => null,
    getCatalog: async () => [],
  };
}

async function buildSweepApp(
  store: InMemoryStore,
  overrides: { now: () => number; notifyMailer: Mailer; unsubscribeSecret: string },
) {
  return buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubToken: 'token',
      submissionTokenSecret: secret,
      gamesRepo: 'gamedevpl/www.gamedev.pl-games',
      githubClient: idleGithubClient(),
      internalAuthVerifier: acceptAll,
      now: overrides.now,
      notifyMailer: overrides.notifyMailer,
      unsubscribeSecret: overrides.unsubscribeSecret,
    },
  });
}

describe('notify sweep email retry', () => {
  it('retries unsent emails by notification row, with an age bound', async () => {
    const nowMs = Date.parse('2026-09-16T12:00:00.000Z');
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:grace', email: 'grace@example.com' });
    await store.createNotification('g:grace', {
      id: 'transfer-recent',
      type: 'transfer.offered',
      createdAt: '2026-09-15T10:00:00.000Z',
      titleKey: 'notifications.transfer.offered.title',
      bodyKey: 'notifications.transfer.offered.body',
      params: { title: 'Sky Dodge', slug: 'sky-dodge' },
      link: '/studio',
    });
    await store.createNotification('g:grace', {
      id: 'transfer-old',
      type: 'transfer.offered',
      createdAt: '2026-08-01T10:00:00.000Z',
      titleKey: 'notifications.transfer.offered.title',
      bodyKey: 'notifications.transfer.offered.body',
      params: { title: 'Sky Dodge', slug: 'sky-dodge' },
      link: '/studio',
    });
    const sent: string[] = [];
    const mailer: Mailer = { name: 'recording', send: async (message) => void sent.push(message.subject) };
    const app = await buildSweepApp(store, {
      now: () => nowMs,
      notifyMailer: mailer,
      unsubscribeSecret: 'test-secret',
    });

    const first = await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: '******' },
    });
    expect(first.statusCode).toBe(200);
    expect(sent).toHaveLength(1);

    const notes = await store.listNotifications('g:grace');
    expect(notes.find((note) => note.id === 'transfer-recent')?.emailedAt).not.toBeNull();
    expect(notes.find((note) => note.id === 'transfer-old')?.emailedAt).toBeNull();

    await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: '******' },
    });
    expect(sent).toHaveLength(1);
    await app.close();
  });
});
