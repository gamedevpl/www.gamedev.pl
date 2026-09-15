import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { emitShareNotice } from './notify-share.js';
import { shareNotificationMessage, sharePushContent } from './email-templates-share.js';

describe('share email copy', () => {
  it('localizes offered and accepted without echoing a uid', () => {
    const en = shareNotificationMessage('bea@example.test', 'en', 'share.offered', {
      title: 'Comet Courier',
      actorName: 'Ada',
      actionUrl: 'https://www.gamedev.pl/studio',
      unsubscribeUrl: 'https://www.gamedev.pl/unsub',
    });
    expect(en.subject).toMatch(/invited to edit/i);
    expect(en.text).toContain('Ada');
    expect(en.text).toContain('Comet Courier');
    expect(en.text).not.toContain('g:');

    const pl = sharePushContent('pl', 'share.accepted', 'Comet Courier', 'Bea');
    expect(pl.title).toMatch(/Edytor/i);
    expect(pl.body).toContain('Bea');
  });
});

describe('emitShareNotice', () => {
  it('writes the in-app row even when email sending throws', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:bea', email: 'bea@example.test', locale: 'en' });
    const mailer = {
      name: 'fake',
      send: vi.fn(async () => {
        throw new Error('smtp down');
      }),
    };
    const logError = vi.fn();

    await emitShareNotice(
      { store, mailer, unsubscribeSecret: 'secret', logError, now: () => Date.parse('2026-01-01T00:00:00.000Z') },
      { type: 'share.offered', uid: 'g:bea', slug: 'sky', gameTitle: 'Sky', actorName: 'Ada' },
    );

    const rows = await store.listNotifications('g:bea');
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('share.offered');
    expect(logError).toHaveBeenCalled();
  });
});
