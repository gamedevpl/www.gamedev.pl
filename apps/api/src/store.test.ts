import { describe, expect, it } from 'vitest';
import { InMemoryStore } from './store.js';

describe('InMemoryStore', () => {
  it('upserts and retrieves user', async () => {
    const store = new InMemoryStore();
    expect(await store.getUser('g:123')).toBeNull();

    const created = await store.upsertUser({
      uid: 'g:123',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://example.com/pic.jpg',
    });

    expect(created.uid).toBe('g:123');
    expect(created.tier).toBe('standard');
    expect(created.email).toBe('test@example.com');

    const fetched = await store.getUser('g:123');
    expect(fetched).toEqual(created);
  });

  it('handles submission tracking', async () => {
    const store = new InMemoryStore();
    expect(await store.getSubmission(42)).toBeNull();

    const created = await store.createSubmission(42, 'g:123', 'My Game');
    expect(created.issueNumber).toBe(42);
    expect(created.ownerUid).toBe('g:123');

    const fetched = await store.getSubmission(42);
    expect(fetched).toEqual(created);
  });

  it('enforces quota limits for standard users', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:123' });

    const limit = 2;
    const dateStr = '2026-07-23';

    // First attempt -> 1
    let res = await store.checkAndIncrementQuota('g:123', dateStr, limit, 'submissions');
    expect(res).toEqual({ allowed: true, current: 1, tier: 'standard' });

    // Second attempt -> 2
    res = await store.checkAndIncrementQuota('g:123', dateStr, limit, 'submissions');
    expect(res).toEqual({ allowed: true, current: 2, tier: 'standard' });

    // Third attempt -> exceeded limit
    res = await store.checkAndIncrementQuota('g:123', dateStr, limit, 'submissions');
    expect(res).toEqual({ allowed: false, current: 2, tier: 'standard' });
  });

  it('bypasses quota for trusted users', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:trusted', tier: 'trusted' });

    for (let i = 0; i < 10; i++) {
      const res = await store.checkAndIncrementQuota('g:trusted', '2026-07-23', 2, 'submissions');
      expect(res.allowed).toBe(true);
      expect(res.tier).toBe('trusted');
    }
  });

  it('blocks quota for blocked users', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:blocked', tier: 'blocked' });

    const res = await store.checkAndIncrementQuota('g:blocked', '2026-07-23', 5, 'submissions');
    expect(res.allowed).toBe(false);
    expect(res.tier).toBe('blocked');
  });

  it('upserts a waitlist entry, idempotently updating requestedAt on repeat joins', async () => {
    const store = new InMemoryStore();

    const first = await store.upsertWaitlistEntry({
      uid: 'g:456',
      email: 'joiner@example.com',
      name: 'Joiner',
      locale: 'en',
    });
    expect(first).toMatchObject({
      uid: 'g:456',
      email: 'joiner@example.com',
      name: 'Joiner',
      locale: 'en',
      status: 'pending',
    });
    expect(store.waitlistEntries()).toHaveLength(1);

    // Joining again with only uid — email/name/locale carry over from the existing entry.
    const second = await store.upsertWaitlistEntry({ uid: 'g:456' });
    expect(second).toMatchObject({
      uid: 'g:456',
      email: 'joiner@example.com',
      name: 'Joiner',
      locale: 'en',
      status: 'pending',
    });
    expect(store.waitlistEntries()).toHaveLength(1);
  });

  it('getWaitlistEntry returns the entry or null', async () => {
    const store = new InMemoryStore();
    expect(await store.getWaitlistEntry('g:nonexistent')).toBeNull();

    await store.upsertWaitlistEntry({ uid: 'g:789', email: 'test@example.com' });
    const entry = await store.getWaitlistEntry('g:789');
    expect(entry).toMatchObject({ uid: 'g:789', email: 'test@example.com', status: 'pending' });
  });
});
