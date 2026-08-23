import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { ConsoleMailer, type EmailMessage, type Mailer } from './mailer.js';
import {
  absoluteAppUrl,
  emitDigestNotification,
  emitOperatorAlert,
  emitSubmissionNotification,
  emitWaitlistJoined,
  notifyOnTransition,
  statusToEvent,
  type EmitDeps,
} from './notify.js';

import type { SubmissionStatusResponse } from '../platform/submission-status.js';

describe('absoluteAppUrl', () => {
  it('joins origin and path without a double slash', () => {
    expect(absoluteAppUrl('https://www.gamedev.pl', '/play/sky-dodge')).toBe('https://www.gamedev.pl/play/sky-dodge');
    expect(absoluteAppUrl('https://www.gamedev.pl/', '/status/tok')).toBe('https://www.gamedev.pl/status/tok');
  });

  it('rejects absolute and protocol-relative paths (open-redirect guard)', () => {
    expect(() => absoluteAppUrl('https://www.gamedev.pl', 'https://evil.test/phish')).toThrow(/in-app path/);
    expect(() => absoluteAppUrl('https://www.gamedev.pl', '//evil.test/phish')).toThrow(/in-app path/);
    expect(() => absoluteAppUrl('https://www.gamedev.pl', 'play/sky-dodge')).toThrow(/in-app path/);
  });
});

describe('InMemoryStore notifications', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('creates a notification and reports created: true', async () => {
    const { created, notification } = await store.createNotification('g:1', {
      id: 'sub-1-published',
      type: 'submission.published',
      titleKey: 'notifications.submission.published.title',
      bodyKey: 'notifications.submission.published.body',
      params: { title: 'Sky Dodge' },
      link: '/play/sky-dodge',
    });
    expect(created).toBe(true);
    expect(notification.readAt).toBeNull();
    expect(notification.emailedAt).toBeNull();
  });

  it('is idempotent: re-creating the same id is a no-op', async () => {
    const args = {
      id: 'sub-1-published',
      type: 'submission.published' as const,
      titleKey: 'k',
      bodyKey: 'b',
      params: {},
      link: '/play/x',
    };
    await store.createNotification('g:1', args);
    await store.markNotificationsRead('g:1', 'all');
    const second = await store.createNotification('g:1', args);
    expect(second.created).toBe(false);
    // The original (now read) record is preserved — not overwritten back to unread.
    expect(second.notification.readAt).not.toBeNull();
    const list = await store.listNotifications('g:1');
    expect(list).toHaveLength(1);
  });

  it('lists newest first and respects the limit', async () => {
    await store.createNotification('g:1', {
      id: 'a',
      type: 'submission.building',
      createdAt: '2026-07-24T10:00:00Z',
      titleKey: 'k',
      bodyKey: 'b',
      params: {},
      link: '/status/a',
    });
    await store.createNotification('g:1', {
      id: 'b',
      type: 'submission.published',
      createdAt: '2026-07-24T11:00:00Z',
      titleKey: 'k',
      bodyKey: 'b',
      params: {},
      link: '/status/b',
    });
    const list = await store.listNotifications('g:1', { limit: 1 });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('b'); // newest
  });

  it('marks specific ids and all as read', async () => {
    for (const id of ['a', 'b']) {
      await store.createNotification('g:1', {
        id,
        type: 'submission.building',
        titleKey: 'k',
        bodyKey: 'b',
        params: {},
        link: '/x',
      });
    }
    await store.markNotificationsRead('g:1', ['a']);
    let list = await store.listNotifications('g:1');
    expect(list.find((n) => n.id === 'a')?.readAt).not.toBeNull();
    expect(list.find((n) => n.id === 'b')?.readAt).toBeNull();

    await store.markNotificationsRead('g:1', 'all');
    list = await store.listNotifications('g:1');
    expect(list.every((n) => n.readAt !== null)).toBe(true);
  });

  it('stamps emailedAt', async () => {
    await store.createNotification('g:1', {
      id: 'a',
      type: 'submission.building',
      titleKey: 'k',
      bodyKey: 'b',
      params: {},
      link: '/x',
    });
    await store.markNotificationEmailed('g:1', 'a', '2026-07-24T12:00:00Z');
    const list = await store.listNotifications('g:1');
    expect(list[0].emailedAt).toBe('2026-07-24T12:00:00Z');
  });

  it('isolates notifications per user', async () => {
    await store.createNotification('g:1', {
      id: 'a',
      type: 'submission.building',
      titleKey: 'k',
      bodyKey: 'b',
      params: {},
      link: '/x',
    });
    expect(await store.listNotifications('g:2')).toEqual([]);
  });
});

describe('emitSubmissionNotification', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('deep-links published events to the game and others to the status page', async () => {
    await emitSubmissionNotification(
      { store },
      {
        uid: 'g:1',
        type: 'submission.published',
        issueNumber: 42,
        gameTitle: 'Sky Dodge',
        statusToken: 'tok',
        slug: 'sky-dodge',
      },
    );
    await emitSubmissionNotification(
      { store },
      { uid: 'g:1', type: 'submission.building', issueNumber: 42, gameTitle: 'Sky Dodge', statusToken: 'tok' },
    );

    const list = await store.listNotifications('g:1');
    const published = list.find((n) => n.type === 'submission.published');
    const building = list.find((n) => n.type === 'submission.building');
    expect(published?.link).toBe('/play/sky-dodge');
    expect(published?.id).toBe('sub-42-published');
    expect(published?.params).toEqual({ title: 'Sky Dodge' });
    expect(building?.link).toBe('/status/tok');
    expect(building?.id).toBe('sub-42-building');
  });

  it('is idempotent per (submission, event)', async () => {
    const event = {
      uid: 'g:1',
      type: 'submission.published' as const,
      issueNumber: 42,
      gameTitle: 'Sky Dodge',
      statusToken: 'tok',
      slug: 'sky-dodge',
    };
    const first = await emitSubmissionNotification({ store }, event);
    const second = await emitSubmissionNotification({ store }, event);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(await store.listNotifications('g:1')).toHaveLength(1);
  });
});

describe('emitSubmissionNotification push fan-out', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:1', locale: 'en' });
    await store.savePushSubscription('g:1', {
      endpoint: 'https://push.example/one',
      keys: { p256dh: 'p', auth: 'a' },
    });
  });

  const event = {
    uid: 'g:1',
    type: 'submission.published' as const,
    issueNumber: 42,
    gameTitle: 'Sky Dodge',
    statusToken: 'tok',
    slug: 'sky-dodge',
  };

  it('pushes to each subscription with a rendered payload deep-linking to the game', async () => {
    const sent: Array<{ endpoint: string; payload: { title: string; body: string; url: string; tag: string } }> = [];
    const pusher = {
      name: 'test',
      async send(
        subscription: { endpoint: string },
        payload: { title: string; body: string; url: string; tag: string },
      ) {
        sent.push({ endpoint: subscription.endpoint, payload });
        return { outcome: 'sent' as const };
      },
    };
    await emitSubmissionNotification({ store, pusher, appBaseUrl: 'https://www.gamedev.pl' }, event);
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.url).toBe('https://www.gamedev.pl/play/sky-dodge');
    expect(sent[0].payload.tag).toBe('sub-42-published');
    expect(sent[0].payload.body).toContain('Sky Dodge');
  });

  it('prunes a subscription the push service reports gone (404/410)', async () => {
    const pusher = {
      name: 'test',
      async send() {
        return { outcome: 'gone' as const };
      },
    };
    await emitSubmissionNotification({ store, pusher }, event);
    expect(await store.listPushSubscriptions('g:1')).toHaveLength(0);
  });

  it('does not re-push when the notification already existed (idempotent emit)', async () => {
    let calls = 0;
    const pusher = {
      name: 'test',
      async send() {
        calls += 1;
        return { outcome: 'sent' as const };
      },
    };
    await emitSubmissionNotification({ store, pusher }, event);
    await emitSubmissionNotification({ store, pusher }, event);
    expect(calls).toBe(1);
  });
});

describe('statusToEvent', () => {
  it('maps notify-worthy statuses and ignores the rest', () => {
    expect(statusToEvent('building')).toBe('submission.building');
    expect(statusToEvent('in_review')).toBe('submission.building');
    expect(statusToEvent('published')).toBe('submission.published');
    expect(statusToEvent('needs_changes')).toBe('submission.needs_changes');
    expect(statusToEvent('queued')).toBeNull();
    expect(statusToEvent('publishing')).toBeNull();
  });
});

describe('notifyOnTransition', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    await store.createSubmission(7, 'g:owner', 'Sky Dodge');
  });

  async function record() {
    return (await store.getSubmission(7))!;
  }

  it('emits on the first transition into a notify-worthy status and records it', async () => {
    const res = await notifyOnTransition({ store }, await record(), { status: 'building' }, 'tok');
    expect(res.emitted).toBe(true);
    expect((await store.listNotifications('g:owner'))[0].id).toBe('sub-7-building');
    expect((await record()).lastNotifiedStatus).toBe('building');
  });

  it('does not double-notify on building → in_review (same event)', async () => {
    await notifyOnTransition({ store }, await record(), { status: 'building' }, 'tok');
    const res = await notifyOnTransition({ store }, await record(), { status: 'in_review' }, 'tok');
    expect(res.emitted).toBe(false);
    expect(await store.listNotifications('g:owner')).toHaveLength(1);
  });

  it('emits published with a play deep-link, then needs no further emit', async () => {
    const published: SubmissionStatusResponse = { status: 'published', slug: 'sky-dodge' };
    const res = await notifyOnTransition({ store }, await record(), published, 'tok');
    expect(res.emitted).toBe(true);
    const list = await store.listNotifications('g:owner');
    expect(list[0].link).toBe('/play/sky-dodge');
    // published is terminal for the sweep
    expect(await store.listActiveSubmissions()).toEqual([]);
  });

  it('does not emit for non-notify statuses', async () => {
    expect((await notifyOnTransition({ store }, await record(), { status: 'queued' }, 'tok')).emitted).toBe(false);
    expect((await notifyOnTransition({ store }, await record(), { status: 'publishing' }, 'tok')).emitted).toBe(false);
    expect(await store.listNotifications('g:owner')).toEqual([]);
  });
});

describe('emitSubmissionNotification email fan-out', () => {
  let store: InMemoryStore;
  let mailer: ConsoleMailer;
  const emailDeps = (): EmitDeps => ({
    store,
    mailer,
    appBaseUrl: 'https://www.gamedev.pl',
    unsubscribeSecret: 'secret',
  });
  const event = {
    uid: 'g:owner',
    type: 'submission.published' as const,
    issueNumber: 9,
    gameTitle: 'Sky Dodge',
    statusToken: 'tok',
    slug: 'sky-dodge',
  };

  beforeEach(async () => {
    store = new InMemoryStore();
    mailer = new ConsoleMailer(() => {});
    await store.upsertUser({ uid: 'g:owner', email: 'owner@example.com' });
  });

  it('sends an email and stamps emailedAt for a subscribed user', async () => {
    await emitSubmissionNotification(emailDeps(), event);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe('owner@example.com');
    expect(mailer.sent[0].headers?.['List-Unsubscribe']).toContain('/api/email/unsubscribe?token=');
    const list = await store.listNotifications('g:owner');
    expect(list[0].emailedAt).not.toBeNull();
  });

  it('does not re-send on a repeat emit (emailedAt set)', async () => {
    await emitSubmissionNotification(emailDeps(), event);
    await emitSubmissionNotification(emailDeps(), event);
    expect(mailer.sent).toHaveLength(1);
  });

  it('skips email for an unsubscribed user', async () => {
    await store.setEmailUnsubscribed('g:owner', new Date().toISOString());
    await emitSubmissionNotification(emailDeps(), event);
    expect(mailer.sent).toHaveLength(0);
    // In-app notification is still created.
    expect(await store.listNotifications('g:owner')).toHaveLength(1);
  });

  it('skips email when the user has no address', async () => {
    await store.upsertUser({ uid: 'g:noemail' });
    await emitSubmissionNotification(emailDeps(), { ...event, uid: 'g:noemail' });
    expect(mailer.sent).toHaveLength(0);
  });

  it('does not send when no mailer/secret is configured (in-app only)', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    await emitSubmissionNotification({ store }, event);
    expect(await store.listNotifications('g:owner')).toHaveLength(1);
    vi.unstubAllEnvs();
  });

  it('falls back to the env mailer when deps omit one (RESEND_API_KEY set)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 }));
    vi.stubEnv('RESEND_API_KEY', 'key_abc');
    vi.stubEnv('SESSION_SECRET', 'sess');

    await emitSubmissionNotification({ store }, event);

    expect(fetchSpy).toHaveBeenCalledWith('https://api.resend.com/emails', expect.anything());
    expect((await store.listNotifications('g:owner'))[0].emailedAt).not.toBeNull();
    vi.unstubAllEnvs();
    fetchSpy.mockRestore();
  });

  it('leaves emailedAt null and does not throw when the send fails (retryable)', async () => {
    const throwing: Mailer = {
      name: 'throwing',
      send: async (_m: EmailMessage) => {
        throw new Error('provider down');
      },
    };
    await emitSubmissionNotification({ ...emailDeps(), mailer: throwing }, event);
    const list = await store.listNotifications('g:owner');
    expect(list[0].emailedAt).toBeNull();
  });
});

describe('digest opt-out', () => {
  function recordingPusher(sent: unknown[]) {
    return {
      name: 'test',
      async send(subscription: { endpoint: string }, payload: unknown) {
        sent.push({ endpoint: subscription.endpoint, payload });
        return { outcome: 'sent' as const };
      },
    };
  }

  const digestEvent = {
    uid: 'g:owner',
    id: 'digest-2026-W31',
    params: { games: '2', sessions: '30', votesUp: '4', votesDown: '1', feedback: '3' },
    link: '/',
    createdAt: '2026-07-28T09:00:00.000Z',
  };

  it('does not push a digest to someone who opted out', async () => {
    // The version of this they cannot fix from an inbox: unsubscribing by email leaves
    // push untouched, so without this the weekly ping keeps arriving forever.
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner', email: 'owner@example.com' });
    await store.savePushSubscription('g:owner', { endpoint: 'https://push.test/a', keys: { p256dh: 'k', auth: 'a' } });
    await store.setDigestOptOut('g:owner', '2026-07-20T00:00:00.000Z');

    const sent: unknown[] = [];
    await emitDigestNotification({ store, pusher: recordingPusher(sent) }, digestEvent);

    expect(sent).toEqual([]);
  });

  it('still pushes a build notification to the same person', async () => {
    // The opt-out is about the digest, not about them.
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner', email: 'owner@example.com' });
    await store.savePushSubscription('g:owner', { endpoint: 'https://push.test/a', keys: { p256dh: 'k', auth: 'a' } });
    await store.setDigestOptOut('g:owner', '2026-07-20T00:00:00.000Z');

    const sent: unknown[] = [];
    await emitSubmissionNotification(
      { store, pusher: recordingPusher(sent) },
      {
        uid: 'g:owner',
        type: 'submission.published' as const,
        issueNumber: 42,
        gameTitle: 'Sky Dodge',
        statusToken: 'tok',
        slug: 'sky-dodge',
      },
    );

    expect(sent).toHaveLength(1);
  });
});

describe('emitOperatorAlert', () => {
  let store: InMemoryStore;
  let mailer: ConsoleMailer;

  const alert = {
    id: 'op-1000001-review_ready',
    kind: 'review_ready' as const,
    issueNumber: 1_000_001,
    title: 'Comet Courier',
    ownerUid: 'g:creator',
    slug: 'comet-courier',
    since: '2026-07-30T11:00:00Z',
  };

  const deps = () => ({
    store,
    mailer,
    appBaseUrl: 'https://www.gamedev.pl',
    unsubscribeSecret: 'secret',
    adminUids: ['g:boss'],
  });

  beforeEach(async () => {
    store = new InMemoryStore();
    mailer = new ConsoleMailer(() => {});
    await store.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
  });

  it('notifies every operator and links them to the queue', async () => {
    await store.upsertUser({ uid: 'g:second', email: 'second@example.com' });

    const { created } = await emitOperatorAlert({ ...deps(), adminUids: ['g:boss', 'g:second'] }, alert);

    expect(created).toBe(2);
    const [notification] = await store.listNotifications('g:boss');
    expect(notification).toMatchObject({
      id: 'op-1000001-review_ready',
      type: 'operator.review_ready',
      titleKey: 'notifications.operator.review_ready.title',
      link: '/admin/queue',
      params: { title: 'Comet Courier', issueNumber: '1000001' },
    });
    expect(mailer.sent.map((message) => message.to)).toEqual(['boss@example.com', 'second@example.com']);
  });

  it('says nothing the second time the sweep sees the same situation', async () => {
    await emitOperatorAlert(deps(), alert);
    const second = await emitOperatorAlert(deps(), alert);

    expect(second.created).toBe(0);
    expect(mailer.sent).toHaveLength(1);
    expect(await store.listNotifications('g:boss')).toHaveLength(1);
  });

  it('reaches an operator who unsubscribed from creator mail', async () => {
    // An alert is a pager, not a subscription. Someone who once clicked "unsubscribe" on
    // a build notification must not thereby have silenced their own queue.
    await store.setEmailUnsubscribed('g:boss', new Date().toISOString());

    await emitOperatorAlert(deps(), alert);

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].headers?.['List-Unsubscribe']).toBeUndefined();
  });

  it('carries the stall kind into the notification, so the fix is legible', async () => {
    await emitOperatorAlert(deps(), {
      ...alert,
      id: 'op-1000001-build_stalled',
      kind: 'build_stalled',
      stall: 'quiet',
    });

    const [notification] = await store.listNotifications('g:boss');
    expect(notification.params.detail).toBe('quiet');
    expect(mailer.sent[0].text).toContain('(quiet)');
  });

  it('creates the in-app record even when email is not configured', async () => {
    const { created } = await emitOperatorAlert({ store, adminUids: ['g:boss'] }, alert);

    expect(created).toBe(1);
    expect(await store.listNotifications('g:boss')).toHaveLength(1);
  });
});

describe('emitWaitlistJoined', () => {
  let store: InMemoryStore;
  let mailer: ConsoleMailer;

  const deps = () => ({
    store,
    mailer,
    appBaseUrl: 'https://www.gamedev.pl',
    adminUids: ['g:boss'],
  });

  beforeEach(async () => {
    store = new InMemoryStore();
    mailer = new ConsoleMailer(() => {});
    await store.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
  });

  it('notifies every operator and links them to the waitlist panel', async () => {
    await store.upsertUser({ uid: 'g:second', email: 'second@example.com' });

    const { created } = await emitWaitlistJoined(
      { ...deps(), adminUids: ['g:boss', 'g:second'] },
      { uid: 'g:waiter', title: 'Waiter', email: 'waiter@example.com' },
    );

    expect(created).toBe(2);
    const [notification] = await store.listNotifications('g:boss');
    expect(notification).toMatchObject({
      id: 'op-waitlist-g:waiter',
      type: 'operator.waitlist_joined',
      titleKey: 'notifications.operator.waitlist_joined.title',
      link: '/admin/waitlist',
      params: { title: 'Waiter', email: 'waiter@example.com' },
    });
    expect(mailer.sent).toHaveLength(2);
    expect(mailer.sent[0].subject).toContain('waitlist');
    expect(mailer.sent[0].text).toContain('waiter@example.com');
    expect(mailer.sent[0].text).toContain('/admin/waitlist');
    expect(mailer.sent[0].text).not.toContain('Job #');
  });

  it('says nothing the second time the same applicant joins', async () => {
    await emitWaitlistJoined(deps(), { uid: 'g:waiter', title: 'Waiter' });
    const second = await emitWaitlistJoined(deps(), { uid: 'g:waiter', title: 'Waiter' });

    expect(second.created).toBe(0);
    expect(mailer.sent).toHaveLength(1);
    expect(await store.listNotifications('g:boss')).toHaveLength(1);
  });

  it('reaches an operator who unsubscribed from creator mail', async () => {
    await store.setEmailUnsubscribed('g:boss', new Date().toISOString());

    await emitWaitlistJoined(deps(), { uid: 'g:waiter', title: 'Waiter', email: 'waiter@example.com' });

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].headers?.['List-Unsubscribe']).toBeUndefined();
  });

  it('keeps in-app fan-out going when the mail action URL cannot be built', async () => {
    await store.upsertUser({ uid: 'g:second', email: 'second@example.com' });
    const errors: string[] = [];

    const { created } = await emitWaitlistJoined(
      {
        store,
        mailer,
        // Not an absolute origin — absoluteAppUrl throws. Email must swallow that and
        // the second operator must still get their in-app notification.
        appBaseUrl: 'not-a-url',
        adminUids: ['g:boss', 'g:second'],
        logError: (_err, msg) => errors.push(msg),
      },
      { uid: 'g:waiter', title: 'Waiter' },
    );

    expect(created).toBe(2);
    expect(await store.listNotifications('g:boss')).toHaveLength(1);
    expect(await store.listNotifications('g:second')).toHaveLength(1);
    expect(mailer.sent).toHaveLength(0);
    expect(errors).toContain('operator alert email send failed');
  });
});
