import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryStore } from './store.js';
import { emitSubmissionNotification, notifyOnTransition, statusToEvent } from './notify.js';
import type { SubmissionStatusResponse } from './submission-status.js';

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
      link: '#/play/sky-dodge',
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
      link: '#/play/x',
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
      link: '#/status/a',
    });
    await store.createNotification('g:1', {
      id: 'b',
      type: 'submission.published',
      createdAt: '2026-07-24T11:00:00Z',
      titleKey: 'k',
      bodyKey: 'b',
      params: {},
      link: '#/status/b',
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
        link: '#/x',
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
      link: '#/x',
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
      link: '#/x',
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
    expect(published?.link).toBe('#/play/sky-dodge');
    expect(published?.id).toBe('sub-42-published');
    expect(published?.params).toEqual({ title: 'Sky Dodge' });
    expect(building?.link).toBe('#/status/tok');
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
    expect(list[0].link).toBe('#/play/sky-dodge');
    // published is terminal for the sweep
    expect(await store.listActiveSubmissions()).toEqual([]);
  });

  it('does not emit for non-notify statuses', async () => {
    expect((await notifyOnTransition({ store }, await record(), { status: 'queued' }, 'tok')).emitted).toBe(false);
    expect((await notifyOnTransition({ store }, await record(), { status: 'publishing' }, 'tok')).emitted).toBe(false);
    expect(await store.listNotifications('g:owner')).toEqual([]);
  });
});
