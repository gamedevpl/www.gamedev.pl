import { describe, expect, it } from 'vitest';
import { buildApp } from './platform/app.js';
import type { GitHubClient } from './catalog/github-client.js';
import { InMemoryStore } from './platform/store.js';
import type { InternalAuthVerifier } from './platform/internal-auth.js';
import { ConsoleMailer, type Mailer } from './notifications/mailer.js';

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
    await store.createNotification('g:grace', {
      id: 'follow-never-email',
      type: 'game.new_version',
      createdAt: '2026-09-15T11:00:00.000Z',
      titleKey: 'notifications.game.new_version.title',
      bodyKey: 'notifications.game.new_version.body',
      params: { title: 'Sky Dodge' },
      link: '/play/sky-dodge',
    });
    await store.createNotification('g:grace', {
      id: 'share-retry',
      type: 'share.offered',
      createdAt: '2026-09-15T11:30:00.000Z',
      titleKey: 'notifications.share.offered.title',
      bodyKey: 'notifications.share.offered.body',
      params: { title: 'Sky Dodge', actorName: 'Ada', slug: 'sky-dodge' },
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
    expect(sent).toHaveLength(2);
    expect(first.json().emailRetry).toMatchObject({
      scanned: 3,
      retried: 2,
      sent: 2,
      skipped: 1,
      failed: 0,
      unconfigured: false,
      error: false,
    });

    const notes = await store.listNotifications('g:grace');
    expect(notes.find((note) => note.id === 'transfer-recent')?.emailedAt).not.toBeNull();
    expect(notes.find((note) => note.id === 'transfer-old')?.emailedAt).toBeNull();
    expect(notes.find((note) => note.id === 'follow-never-email')?.emailedAt).not.toBeNull();
    expect(notes.find((note) => note.id === 'share-retry')?.emailedAt).not.toBeNull();

    await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: '******' },
    });
    expect(sent).toHaveLength(2);
    await app.close();
  });

  it('stamps a digest skip when the creator opted out of the weekly summary', async () => {
    const nowMs = Date.parse('2026-09-16T12:00:00.000Z');
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:grace', email: 'grace@example.com' });
    await store.setDigestOptOut('g:grace', '2026-09-15T00:00:00.000Z');
    await store.createNotification('g:grace', {
      id: 'digest-2026-W38',
      type: 'creator.digest',
      createdAt: '2026-09-15T10:00:00.000Z',
      titleKey: 'notifications.creator.digest.title',
      bodyKey: 'notifications.creator.digest.body',
      params: { games: '1', sessions: '4', votesUp: '0', votesDown: '0', feedback: '0' },
      link: '/',
    });
    const sent: string[] = [];
    const mailer: Mailer = { name: 'recording', send: async (message) => void sent.push(message.subject) };
    const app = await buildSweepApp(store, {
      now: () => nowMs,
      notifyMailer: mailer,
      unsubscribeSecret: 'test-secret',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: '******' },
    });
    expect(res.statusCode).toBe(200);
    expect(sent).toHaveLength(0);
    expect(res.json().emailRetry).toMatchObject({
      scanned: 1,
      retried: 0,
      sent: 0,
      skipped: 1,
      failed: 0,
      unconfigured: false,
      error: false,
    });
    expect((await store.listNotifications('g:grace'))[0]?.emailedAt).not.toBeNull();
    await app.close();
  });

  it('does not scan or count failures when the mailer is the console fake', async () => {
    const nowMs = Date.parse('2026-09-16T12:00:00.000Z');
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:grace', email: 'grace@example.com' });
    await store.createNotification('g:grace', {
      id: 'transfer-pending',
      type: 'transfer.offered',
      createdAt: '2026-09-15T10:00:00.000Z',
      titleKey: 'notifications.transfer.offered.title',
      bodyKey: 'notifications.transfer.offered.body',
      params: { title: 'Sky Dodge', slug: 'sky-dodge' },
      link: '/studio',
    });
    const mailer = new ConsoleMailer(() => {});
    const app = await buildSweepApp(store, {
      now: () => nowMs,
      notifyMailer: mailer,
      unsubscribeSecret: 'test-secret',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: '******' },
    });
    expect(res.statusCode).toBe(200);
    expect(mailer.sent).toHaveLength(0);
    expect(res.json().emailRetry).toMatchObject({
      scanned: 0,
      retried: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      unconfigured: true,
      error: false,
    });
    expect((await store.listNotifications('g:grace'))[0]?.emailedAt).toBeNull();
    await app.close();
  });

  it('fails the sweep when the pending-email query throws', async () => {
    const nowMs = Date.parse('2026-09-16T12:00:00.000Z');
    class QueryFailStore extends InMemoryStore {
      async listPendingEmailNotifications(): Promise<never> {
        throw Object.assign(new Error('9 FAILED_PRECONDITION: requires an index'), { code: 9 });
      }
    }
    const store = new QueryFailStore();
    const mailer: Mailer = { name: 'recording', send: async () => ({ provider: 'recording' }) };
    const app = await buildSweepApp(store, {
      now: () => nowMs,
      notifyMailer: mailer,
      unsubscribeSecret: 'test-secret',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: '******' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().emailRetry).toMatchObject({ error: true, scanned: 0 });
    await app.close();
  });
});
