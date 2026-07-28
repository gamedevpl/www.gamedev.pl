import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore, TELEMETRY_COLLECTION, TELEMETRY_RETENTION_DAYS, telemetryExpiresAt } from './store.js';

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

  it('isWaitlistApproved returns true when entry status is approved (by uid or email)', async () => {
    const store = new InMemoryStore();
    await store.upsertWaitlistEntry({ uid: 'g:789', email: 'approved@example.com' });
    expect(await store.isWaitlistApproved('g:789', 'approved@example.com')).toBe(false);

    await store.setWaitlistStatus('g:789', 'approved');
    expect(await store.isWaitlistApproved('g:789')).toBe(true);
    expect(await store.isWaitlistApproved('g:other', 'APPROVED@example.com')).toBe(true);
    expect(await store.isWaitlistApproved('g:other', 'unknown@example.com')).toBe(false);
  });
});

/**
 * Retention is enforced by a Firestore TTL policy applied out-of-band, so what can be
 * tested here is the part the policy depends on: the deadline the writer stamps, and the
 * names the policy has to be pointed at.
 */
describe('telemetry retention', () => {
  it('dates the deadline from the event, not from when it was written', () => {
    const at = '2026-07-25T10:04:39.669Z';
    const expiry = telemetryExpiresAt(at);

    // A late flush back-dates `at` by up to six hours; retention counts from the play,
    // so a back-dated event expires earlier than one received at the same moment.
    expect(expiry.toISOString()).toBe('2026-10-23T10:04:39.669Z');
    expect(expiry.getTime() - Date.parse(at)).toBe(TELEMETRY_RETENTION_DAYS * 86_400_000);
  });

  it('never yields an immortal row for an unparseable timestamp', () => {
    const before = Date.now();
    const expiry = telemetryExpiresAt('not a timestamp');

    const window = TELEMETRY_RETENTION_DAYS * 86_400_000;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + window);
    expect(expiry.getTime()).toBeLessThanOrEqual(Date.now() + window);
  });

  it('keeps play data out of the collection group that holds build history', () => {
    // A TTL policy is scoped to a collection group. Sharing `events` with
    // `submissions/{n}/events` would put one retention rule over both.
    expect(TELEMETRY_COLLECTION).not.toBe('events');
  });
});

describe('InMemoryStore build previews', () => {
  const ISSUE = 4242;

  async function push(store: InMemoryStore, label: string) {
    // No cast: the literal has to satisfy the real argument type, so a change to
    // `appendBuildPreview`'s signature fails here instead of being silently absorbed.
    await store.appendBuildPreview(ISSUE, { slug: 'sky-dodge', label, data: '<html></html>' });
    // Same keep count the agent channel uses, so the interaction under test is the real one.
    await store.pruneBuildPreviews(ISSUE, 4);
  }

  it('keeps append order across a prune, even within a single millisecond', async () => {
    // `pruneBuildPreviews` writes the array back sorted newest-first, so after the first
    // prune the last element is the *oldest*. `appendBuildPreview` used to read that
    // element to decide whether to bump the timestamp, which meant the bump stopped
    // firing exactly when previews were arriving fast enough to need it — two appends in
    // one millisecond then tied on `createdAt` and were ordered by a random UUID.
    //
    // The clock is frozen so every append genuinely lands on the same tick: the ordering
    // then depends on nothing but the bump, and the test fails every run instead of one
    // in eight.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T09:00:00.000Z'));
    try {
      const store = new InMemoryStore();
      for (let index = 0; index < 7; index += 1) await push(store, `build ${index}`);

      const newest = await store.listBuildPreviews(ISSUE);
      expect(newest.map((preview) => preview.label)).toEqual(['build 6', 'build 5', 'build 4', 'build 3']);
    } finally {
      vi.useRealTimers();
    }
  });
});
