// What a bell poll costs, and whose window it is.

import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { emitSubmissionNotification } from './notify.js';
import { invalidateNotificationCache, readNotificationsCached } from './notification-cache.js';

async function seed(store: InMemoryStore, uid: string, id: string): Promise<void> {
  await store.createNotification(uid, {
    id,
    type: 'submission.published',
    titleKey: 'notifications.submission.published.title',
    bodyKey: 'notifications.submission.published.body',
    params: { title: id },
    link: `/games/${id}`,
  });
}

describe('notification read window', () => {
  it('reads once across a window of polls', async () => {
    const store = new InMemoryStore();
    await seed(store, 'u1', 'n1');
    const spy = vi.spyOn(store, 'listNotifications');
    let clock = 1_700_000_000_000;

    for (let i = 0; i < 5; i += 1) {
      const rows = await readNotificationsCached(store, 'u1', 20, () => clock);
      expect(rows.map((r) => r.id)).toEqual(['n1']);
      clock += 60_000;
    }

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('re-reads once the window is over', async () => {
    const store = new InMemoryStore();
    await seed(store, 'u1', 'n1');
    const spy = vi.spyOn(store, 'listNotifications');
    let clock = 1_700_000_000_000;

    await readNotificationsCached(store, 'u1', 20, () => clock);
    clock += 6 * 60_000;
    await readNotificationsCached(store, 'u1', 20, () => clock);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("never answers one user with another user's list", async () => {
    const store = new InMemoryStore();
    await seed(store, 'u1', 'mine');
    await seed(store, 'u2', 'theirs');
    const clock = () => 1_700_000_000_000;

    expect((await readNotificationsCached(store, 'u1', 20, clock)).map((r) => r.id)).toEqual(['mine']);
    expect((await readNotificationsCached(store, 'u2', 20, clock)).map((r) => r.id)).toEqual(['theirs']);
    expect((await readNotificationsCached(store, 'u1', 20, clock)).map((r) => r.id)).toEqual(['mine']);
  });

  it('holds a separate window per store', async () => {
    const one = new InMemoryStore();
    const two = new InMemoryStore();
    await seed(one, 'u1', 'from-one');
    await seed(two, 'u1', 'from-two');
    const clock = () => 1_700_000_000_000;

    expect((await readNotificationsCached(one, 'u1', 20, clock)).map((r) => r.id)).toEqual(['from-one']);
    expect((await readNotificationsCached(two, 'u1', 20, clock)).map((r) => r.id)).toEqual(['from-two']);
  });

  it('drops the window when asked, so a fresh row shows on the next poll', async () => {
    const store = new InMemoryStore();
    await seed(store, 'u1', 'n1');
    const clock = () => 1_700_000_000_000;
    await readNotificationsCached(store, 'u1', 20, clock);

    await seed(store, 'u1', 'n2');
    expect((await readNotificationsCached(store, 'u1', 20, clock)).map((r) => r.id)).toEqual(['n1']);

    invalidateNotificationCache(store, 'u1');
    expect((await readNotificationsCached(store, 'u1', 20, clock)).map((r) => r.id).sort()).toEqual(['n1', 'n2']);
  });

  it('lets an emitted notification through without waiting out the window', async () => {
    const store = new InMemoryStore();
    await seed(store, 'g:1', 'old');
    const clock = () => 1_700_000_000_000;
    expect(await readNotificationsCached(store, 'g:1', 20, clock)).toHaveLength(1);

    await emitSubmissionNotification(
      { store },
      { uid: 'g:1', type: 'submission.published', jobId: 42, gameTitle: 'Sky Dodge', statusToken: 'tok' },
    );

    expect(await readNotificationsCached(store, 'g:1', 20, clock)).toHaveLength(2);
  });

  it('goes back to the store when the window holds fewer rows than asked for', async () => {
    const store = new InMemoryStore();
    await seed(store, 'u1', 'n1');
    await seed(store, 'u1', 'n2');
    const spy = vi.spyOn(store, 'listNotifications');
    const clock = () => 1_700_000_000_000;

    expect(await readNotificationsCached(store, 'u1', 1, clock)).toHaveLength(1);
    expect(await readNotificationsCached(store, 'u1', 20, clock)).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(2);
    // The wider window then serves the narrower read.
    expect(await readNotificationsCached(store, 'u1', 1, clock)).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
