import { describe, expect, it, vi } from 'vitest';
import { dispatchAttempt, InMemoryStore, MAX_JOB_TRANSITIONS } from './store.js';

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

  it('replaces the dispatch credit placeholder when a session bills in tokens', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:123', 'A game');
    await store.recordJobCost(1, {
      kind: 'agent_session',
      at: '2026-08-08T10:00:00Z',
      by: 'managed:anthropic',
      ref: 's1',
      credits: 1,
    });

    await store.setJobCostTokens(1, 's1', { input: 120_000, output: 8_000 });

    const [entry] = (await store.getSubmission(1))?.costs ?? [];
    expect(entry.tokens).toEqual({ input: 120_000, output: 8_000 });
    expect(entry.credits).toBeUndefined();
  });

  it('keeps a measured credit figure, which is real', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:123', 'A game');
    await store.recordJobCost(1, {
      kind: 'agent_session',
      at: '2026-08-08T10:00:00Z',
      by: 'copilot',
      ref: 's1',
      credits: 1,
    });
    await store.setJobCostCredits(1, 's1', 212);

    await store.setJobCostTokens(1, 's1', { input: 10, output: 2 });

    const [entry] = (await store.getSubmission(1))?.costs ?? [];
    expect(entry.credits).toBe(212);
    expect(entry.tokens).toEqual({ input: 10, output: 2 });
  });

  it('persists a later OpenAI usage breakdown even when input/output are unchanged', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:123', 'A game');
    await store.recordJobCost(1, {
      kind: 'agent_session',
      at: '2026-08-17T10:00:00Z',
      by: 'managed:openai',
      ref: 's1',
      credits: 1,
    });

    await store.setJobCostTokens(1, 's1', {
      vendor: 'openai',
      model: 'gpt-5.6-luna',
      input: 100,
      output: 50,
      total: 150,
      reasoning: 0,
      cached: 0,
    });
    // Same input/output, later reasoning/cached — generic comparison would miss this.
    await store.setJobCostTokens(1, 's1', {
      vendor: 'openai',
      model: 'gpt-5.6-luna',
      input: 100,
      output: 50,
      total: 150,
      reasoning: 20,
      cached: 15,
    });

    const [entry] = (await store.getSubmission(1))?.costs ?? [];
    expect(entry.tokens).toEqual({
      vendor: 'openai',
      model: 'gpt-5.6-luna',
      input: 100,
      output: 50,
      total: 150,
      reasoning: 20,
      cached: 15,
    });
  });

  it('records job transitions as a history, newest state on the record', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:123', 'A game');

    expect(await store.recordJobTransition(1, { to: 'queued', at: '2026-07-30T10:00:00Z', by: 'creator' })).toBe(true);
    await store.recordJobTransition(1, { to: 'building', at: '2026-07-30T10:05:00Z', by: 'reconciler' });

    const record = await store.getSubmission(1);
    // The record carries where the job *is*; the history carries how it got there.
    expect(record?.state).toBe('building');
    expect(record?.stateSince).toBe('2026-07-30T10:05:00Z');
    expect(record?.transitions?.map((t) => t.to)).toEqual(['queued', 'building']);
  });

  it('bumps roundGeneration on each closing transition, and initializes legacy jobs', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(3, 'g:123', 'A game');
    expect((await store.getSubmission(3))?.roundGeneration).toBe(1);

    await store.recordJobTransition(3, {
      to: 'ready_for_review',
      at: '2026-07-30T10:00:00Z',
      by: 'gate',
      reason: 'gate_green',
    });
    expect((await store.getSubmission(3))?.roundGeneration).toBe(2);

    await store.recordJobTransition(3, {
      to: 'needs_changes',
      at: '2026-07-30T10:01:00Z',
      by: 'operator',
      reason: 'rejected',
    });
    expect((await store.getSubmission(3))?.roundGeneration).toBe(3);

    await store.recordJobTransition(3, {
      to: 'canceled',
      at: '2026-07-30T10:02:00Z',
      by: 'operator',
      reason: 'operator_canceled',
    });
    expect((await store.getSubmission(3))?.roundGeneration).toBe(4);

    // Legacy job: no field until the first close initializes it.
    const legacyStore = new InMemoryStore();
    await legacyStore.createSubmission(4, 'g:123', 'Legacy');
    const legacyMap = (legacyStore as unknown as { submissions: Map<number, import('./store.js').SubmissionRecord> })
      .submissions;
    legacyMap.set(4, { ...(await legacyStore.getSubmission(4))!, roundGeneration: undefined });
    await legacyStore.recordJobTransition(4, {
      to: 'canceled',
      at: '2026-07-30T10:03:00Z',
      by: 'creator',
      reason: 'abandoned',
    });
    expect((await legacyStore.getSubmission(4))?.roundGeneration).toBe(1);

    // A red gate does not close the round — same-session repair still holds the token.
    const repairStore = new InMemoryStore();
    await repairStore.createSubmission(5, 'g:123', 'Repair');
    await repairStore.recordJobTransition(5, {
      to: 'needs_changes',
      at: '2026-07-30T10:04:00Z',
      by: 'gate',
      reason: 'gate_red',
    });
    expect((await repairStore.getSubmission(5))?.roundGeneration).toBe(1);
    expect(await repairStore.bumpRoundGeneration(5)).toBe(2);
  });

  it('touchLastAgentSignalAt refreshes heartbeat without writing chat events', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(61, 'g:123', 'Heartbeat');
    expect((await store.getSubmission(61))?.lastAgentSignalAt).toBeUndefined();

    await store.touchLastAgentSignalAt(61, '2026-08-04T00:00:00.000Z', { key: 'browsing_kit' });
    expect((await store.getSubmission(61))?.lastAgentSignalAt).toBe('2026-08-04T00:00:00.000Z');
    expect((await store.getSubmission(61))?.lastAgentPresence).toEqual({
      key: 'browsing_kit',
      at: '2026-08-04T00:00:00.000Z',
    });
    expect(await store.listBuildEvents(61)).toEqual([]);

    // A real chat row clears the ambient thought.
    await store.appendBuildEvent(61, { kind: 'step', text: 'Sketching the title screen.' });
    expect((await store.getSubmission(61))?.lastAgentPresence).toBeUndefined();
    expect((await store.getSubmission(61))?.lastAgentSignalAt).toBeTruthy();
  });

  it('touchLastAgentSignalAt can preserve agentEndedAt for gate-poll presence', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(62, 'g:123', 'Ended');
    await store.markAgentEnded(62, '2026-08-04T01:00:00.000Z');

    await store.touchLastAgentSignalAt(
      62,
      '2026-08-04T01:01:00.000Z',
      { key: 'waiting_checks' },
      { preserveEnded: true },
    );
    expect((await store.getSubmission(62))?.agentEndedAt).toBe('2026-08-04T01:00:00.000Z');
    expect((await store.getSubmission(62))?.agentEndedBy).toBe('end');
    expect((await store.getSubmission(62))?.lastAgentSignalAt).toBe('2026-08-04T01:01:00.000Z');

    await store.touchLastAgentSignalAt(62, '2026-08-04T01:02:00.000Z', { key: 'browsing_kit' });
    expect((await store.getSubmission(62))?.agentEndedAt).toBeUndefined();
    expect((await store.getSubmission(62))?.agentEndedBy).toBeUndefined();
  });

  it('ensureRoundGeneration initializes a legacy job without bumping an existing one', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(6, 'g:123', 'Legacy');
    const map = (store as unknown as { submissions: Map<number, import('./store.js').SubmissionRecord> }).submissions;
    map.set(6, { ...(await store.getSubmission(6))!, roundGeneration: undefined });

    expect(await store.ensureRoundGeneration(6)).toBe(1);
    expect((await store.getSubmission(6))?.roundGeneration).toBe(1);
    // Idempotent: a job already on generation 3 stays there.
    await store.bumpRoundGeneration(6);
    await store.bumpRoundGeneration(6);
    expect(await store.ensureRoundGeneration(6)).toBe(3);
  });

  it('reports a missing submission rather than inventing one', async () => {
    const store = new InMemoryStore();
    expect(await store.recordJobTransition(404, { to: 'queued', at: '2026-07-30T10:00:00Z', by: 'system' })).toBe(
      false,
    );
  });

  it('treats a duplicate same-state+reason transition as a no-op (concurrent reconciler)', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(7, 'g:123', 'Race');
    expect(
      await store.recordJobTransition(7, {
        to: 'submitted',
        at: '2026-07-30T10:00:00Z',
        by: 'system',
      }),
    ).toBe(true);
    expect(
      await store.recordJobTransition(7, {
        to: 'needs_changes',
        at: '2026-07-30T10:01:00Z',
        by: 'gate',
        reason: 'gate_red',
      }),
    ).toBe(true);
    expect(
      await store.recordJobTransition(7, {
        to: 'needs_changes',
        at: '2026-07-30T10:01:01Z',
        by: 'gate',
        reason: 'gate_red',
      }),
    ).toBe(false);
    const record = await store.getSubmission(7);
    expect(record?.transitions?.filter((t) => t.to === 'needs_changes')).toHaveLength(1);
  });

  it('still records a same-state transition when the reason is new (operator retry)', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(8, 'g:123', 'Retry');
    await store.recordJobTransition(8, {
      to: 'building',
      at: '2026-07-30T10:00:00Z',
      by: 'reconciler',
      reason: 'task_in_progress',
    });
    expect(
      await store.recordJobTransition(8, {
        to: 'building',
        at: '2026-07-30T10:05:00Z',
        by: 'operator',
        reason: 'operator_retry',
      }),
    ).toBe(true);
    const record = await store.getSubmission(8);
    expect(record?.transitions?.at(-1)).toMatchObject({
      to: 'building',
      by: 'operator',
      reason: 'operator_retry',
    });
  });

  it('caps transition history so a flapping reconciler cannot grow the document', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(2, 'g:123', 'A game');
    // Alternate states so every write is a real move — same-state writes are refused
    // and would otherwise leave the history short of the cap.
    for (let i = 0; i < MAX_JOB_TRANSITIONS + 10; i += 1) {
      await store.recordJobTransition(2, {
        to: i % 2 === 0 ? 'building' : 'queued',
        at: new Date(Date.parse('2026-07-30T10:00:00Z') + i * 1000).toISOString(),
        by: 'reconciler',
      });
    }

    const record = await store.getSubmission(2);
    expect(record?.transitions).toHaveLength(MAX_JOB_TRANSITIONS);
    // The tail is kept: what anyone debugging a live build actually looks at.
    expect(record?.transitions?.at(-1)?.at).toBe(
      new Date(Date.parse('2026-07-30T10:00:00Z') + (MAX_JOB_TRANSITIONS + 9) * 1000).toISOString(),
    );
  });

  it('refuses a same-state reconciler write so a re-observation cannot reset the state clock', async () => {
    // Stronger than identical-reason no-op: a different reason from a non-operator
    // must not look like a move either (ready_for_review / gate_green → ready_for_review
    // / derived_from_github was the #398 rough edge).
    const store = new InMemoryStore();
    await store.createSubmission(9, 'g:123', 'A game');
    await store.recordJobTransition(9, {
      to: 'ready_for_review',
      at: '2026-07-30T10:00:00Z',
      by: 'gate',
      reason: 'gate_green',
    });

    expect(
      await store.recordJobTransition(9, {
        to: 'ready_for_review',
        at: '2026-07-30T12:30:00Z',
        by: 'reconciler',
        reason: 'derived_from_github',
      }),
    ).toBe(false);

    const record = await store.getSubmission(9);
    expect(record?.stateSince).toBe('2026-07-30T10:00:00Z');
    expect(record?.transitions).toEqual([
      { to: 'ready_for_review', at: '2026-07-30T10:00:00Z', by: 'gate', reason: 'gate_green' },
    ]);
  });

  it('handles submission tracking', async () => {
    const store = new InMemoryStore();
    expect(await store.getSubmission(42)).toBeNull();

    const created = await store.createSubmission(42, 'g:123', 'My Game');
    expect(created.jobId).toBe(42);
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

  it('creates, atomically claims, and revokes one-time beta invites', async () => {
    const store = new InMemoryStore();
    const created = await store.createBetaInvite('g:operator');

    expect(created.code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(created.invite).not.toHaveProperty('code');
    expect((await store.claimBetaInvite(created.code, 'g:first')).ok).toBe(true);
    expect(await store.claimBetaInvite(created.code, 'g:first')).toMatchObject({ ok: true });
    expect(await store.claimBetaInvite(created.code, 'g:second')).toEqual({ ok: false, reason: 'claimed' });

    const other = await store.createBetaInvite('g:operator');
    expect(await store.revokeBetaInvite(other.invite.id, 'g:operator')).toMatchObject({ status: 'revoked' });
    expect(await store.claimBetaInvite(other.code, 'g:second')).toEqual({ ok: false, reason: 'revoked' });
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

  it('lists waitlist entries newest first and filters by status', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-01T10:00:00.000Z'));
      const store = new InMemoryStore();
      await store.upsertWaitlistEntry({ uid: 'g:old', email: 'old@example.com' });
      await store.setWaitlistStatus('g:old', 'approved');
      // requestedAt is stamped on upsert; a later join sorts first.
      vi.setSystemTime(new Date('2026-08-01T11:00:00.000Z'));
      await store.upsertWaitlistEntry({ uid: 'g:new', email: 'new@example.com' });

      const pending = await store.listWaitlistEntries({ status: 'pending' });
      expect(pending.map((entry) => entry.uid)).toEqual(['g:new']);
      expect(await store.countWaitlistEntries('pending')).toBe(1);
      expect(await store.countWaitlistEntries('approved')).toBe(1);

      const all = await store.listWaitlistEntries();
      expect(all.map((entry) => entry.uid)).toEqual(['g:new', 'g:old']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('pre-approves by email when no waitlist row exists yet', async () => {
    const store = new InMemoryStore();
    const created = await store.setWaitlistStatusByEmail('Friend@Example.com', 'approved');
    expect(created).toMatchObject({
      uid: 'email:friend@example.com',
      email: 'friend@example.com',
      status: 'approved',
    });
    expect(await store.isWaitlistApproved('g:whoever', 'friend@example.com')).toBe(true);

    await store.upsertWaitlistEntry({ uid: 'g:joined', email: 'joined@example.com' });
    const updated = await store.setWaitlistStatusByEmail('joined@example.com', 'rejected');
    expect(updated).toMatchObject({ uid: 'g:joined', status: 'rejected' });
  });

  it('stores waitlist emails lowercased so approve-by-email finds a mixed-case join', async () => {
    const store = new InMemoryStore();
    const joined = await store.upsertWaitlistEntry({ uid: 'g:mix', email: 'Friend@Example.com' });
    expect(joined.email).toBe('friend@example.com');

    const approved = await store.setWaitlistStatusByEmail('FRIEND@example.com', 'approved');
    expect(approved).toMatchObject({ uid: 'g:mix', status: 'approved' });
    expect(store.waitlistEntries()).toHaveLength(1);
  });

  it('lists only queued jobs, for the dispatch reaper', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:a', 'Queued game');
    await store.recordJobTransition(1, { to: 'queued', at: '2026-08-15T00:00:00Z', by: 'system' });
    await store.createSubmission(2, 'g:a', 'Dispatched game');
    await store.recordJobTransition(2, { to: 'dispatched', at: '2026-08-15T00:00:00Z', by: 'system' });

    const queued = await store.listQueuedSubmissions();

    expect(queued.map((s) => s.jobId)).toEqual([1]);
  });

  it('claims a job stuck queued exactly once', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:a', 'Queued game');
    await store.recordJobTransition(1, { to: 'queued', at: '2026-08-15T00:00:00Z', by: 'system' });

    expect(await store.claimDispatchReaperAttempt(1, '2026-08-15T00:00:00Z')).toBe(true);
    expect((await store.getSubmission(1))?.dispatchReaperAttemptedAt).toBe('2026-08-15T00:00:00Z');
    expect(await store.claimDispatchReaperAttempt(1, '2026-08-15T00:05:00Z')).toBe(false);
  });

  it('refuses to claim a job that already left queued or already has a dispatch ref', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:a', 'Dispatched game');
    await store.recordJobTransition(1, { to: 'queued', at: '2026-08-15T00:00:00Z', by: 'system' });
    await store.recordJobTransition(1, { to: 'dispatched', at: '2026-08-15T00:00:01Z', by: 'system' });
    await store.createSubmission(2, 'g:a', 'Refs but still queued');
    await store.recordJobTransition(2, { to: 'queued', at: '2026-08-15T00:00:00Z', by: 'system' });
    await store.recordDispatch(2, { backend: 'stub', ref: 'task-1' });

    expect(await store.claimDispatchReaperAttempt(1, '2026-08-15T00:00:00Z')).toBe(false);
    expect(await store.claimDispatchReaperAttempt(2, '2026-08-15T00:00:00Z')).toBe(false);
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

/**
 * Publication authority.
 *
 * The point of keeping this out of storage is that withdrawal is immediate and total: no
 * merge, no revert, and no possibility that an object left in a bucket keeps serving a
 * game that was taken down.
 */
describe('publication registry', () => {
  const published = {
    slug: 'comet-courier',
    state: 'published' as const,
    currentVersion: 'v20260730T100000Z',
    publishedAt: '2026-07-30T10:00:00Z',
  };

  it('publishes a slug at a specific stored version', async () => {
    const store = new InMemoryStore();
    await store.setPublication(published);

    expect(await store.getPublication('comet-courier')).toMatchObject({
      state: 'published',
      currentVersion: 'v20260730T100000Z',
    });
  });

  it('moves a game to a new version without touching the old objects', async () => {
    // Rollback is the same operation in reverse — a pointer move, not a rebuild.
    const store = new InMemoryStore();
    await store.setPublication(published);
    await store.setPublication({ ...published, currentVersion: 'v2' });

    expect((await store.getPublication('comet-courier'))?.currentVersion).toBe('v2');
  });

  it('records why and when a game was withdrawn', async () => {
    // A DSA statement of reasons is written from this; a takedown that only flips a flag
    // leaves nothing to write it from.
    const store = new InMemoryStore();
    await store.setPublication(published);

    expect(await store.takedownPublication('comet-courier', 'infringing assets', '2026-07-30T12:00:00Z')).toBe(true);

    expect(await store.getPublication('comet-courier')).toMatchObject({
      state: 'disabled',
      takedownReason: 'infringing assets',
      takedownAt: '2026-07-30T12:00:00Z',
    });
  });

  it('reports a takedown of something never published rather than inventing a record', async () => {
    const store = new InMemoryStore();
    expect(await store.takedownPublication('nope', 'x', '2026-07-30T12:00:00Z')).toBe(false);
  });

  it('archives a game under its own state, distinct from a moderation takedown', async () => {
    const store = new InMemoryStore();
    await store.setPublication(published);

    expect(await store.archivePublication('comet-courier', 'deleted by creator', '2026-07-30T12:00:00Z')).toBe(true);

    expect(await store.getPublication('comet-courier')).toMatchObject({
      state: 'archived',
      takedownReason: 'deleted by creator',
      takedownAt: '2026-07-30T12:00:00Z',
    });
  });

  it('reports an archive of something never published rather than inventing a record', async () => {
    const store = new InMemoryStore();
    expect(await store.archivePublication('nope', 'x', '2026-07-30T12:00:00Z')).toBe(false);
  });

  it('keeps a withdrawn game out of nothing — the bake decides, from state', async () => {
    // listPublications returns every record, including disabled ones. The bake filters on
    // state rather than on presence, so a withdrawn game is visibly withdrawn instead of
    // silently absent, and an accidental delete cannot look like a takedown.
    const store = new InMemoryStore();
    await store.setPublication(published);
    await store.setPublication({ ...published, slug: 'other' });
    await store.takedownPublication('other', 'spam', '2026-07-30T12:00:00Z');

    const all = await store.listPublications();
    expect(all).toHaveLength(2);
    expect(all.filter((record) => record.state === 'published').map((record) => record.slug)).toEqual([
      'comet-courier',
    ]);
  });
});

describe('creator message history', () => {
  it('lists every message oldest-first, delivered or not', async () => {
    // The agent's inbox (listPendingCreatorMessages) forgets a message once it is
    // delivered; the status page must not — it echoes the creator's own revision
    // history, and a request the agent already collected is still one they made.
    const store = new InMemoryStore();
    const first = await store.appendCreatorMessage(9, 'make the ship faster');
    await store.appendCreatorMessage(9, 'add a pause button');
    await store.markCreatorMessagesDelivered(9, [first.id]);

    expect((await store.listPendingCreatorMessages(9)).map((m) => m.text)).toEqual(['add a pause button']);
    expect((await store.listCreatorMessages(9)).map((m) => m.text)).toEqual([
      'make the ship faster',
      'add a pause button',
    ]);
  });

  it('keeps the newest messages when over the limit', async () => {
    const store = new InMemoryStore();
    for (let i = 0; i < 5; i++) await store.appendCreatorMessage(9, `request ${i}`);
    expect((await store.listCreatorMessages(9, { limit: 2 })).map((m) => m.text)).toEqual(['request 3', 'request 4']);
  });

  it('never returns a studio-origin message from the pending inbox, even if not marked delivered', async () => {
    // Belt and braces: a studio row must never reach a builder.
    const store = new InMemoryStore();
    await store.appendCreatorMessage(9, 'make the enemies faster');
    await store.appendCreatorMessage(9, 'Still building — no changes are live yet.', {
      origin: 'studio',
      delivered: true,
    });

    // A writer that forgets to mark a studio row delivered.
    await store.appendCreatorMessage(9, 'a studio row nobody delivered', { origin: 'studio' });

    const pending = await store.listPendingCreatorMessages(9);
    expect(pending.map((m) => m.text)).toEqual(['make the enemies faster']);
    expect(pending.some((m) => m.origin === 'studio')).toBe(false);
  });

  it('includes studio-origin messages in the full thread history, in order', async () => {
    const store = new InMemoryStore();
    await store.appendCreatorMessage(9, 'is it done?', { delivered: true });
    await store.appendCreatorMessage(9, 'Still building.', { origin: 'studio', delivered: true });

    const all = await store.listCreatorMessages(9);
    expect(all.map((m) => ({ text: m.text, origin: m.origin }))).toEqual([
      { text: 'is it done?', origin: undefined },
      { text: 'Still building.', origin: 'studio' },
    ]);
  });
});

// Relocated from copilot-backend.test.ts (MP-04) — generic store behavior.
describe('dispatch records', () => {
  it('leaves a fresh submission with no dispatch record until one is recorded', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:1', 'A game');

    expect((await store.getSubmission(1))?.dispatch).toBeUndefined();
  });

  it('records every round against one workspace', async () => {
    // Refs accumulate per round; the workspace and newest ref stay current.
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:1', 'A game');

    await store.recordDispatch(1, { backend: 'copilot', ref: 'task-1', workspace: 'copilot/x' });
    await store.recordDispatch(1, { backend: 'copilot', ref: 'task-2' });

    expect((await store.getSubmission(1))?.dispatch).toEqual({
      backend: 'copilot',
      refs: ['task-1', 'task-2'],
      workspace: 'copilot/x',
      seedWorkspace: undefined,
    });
  });
});

describe('dispatchAttempt', () => {
  it('counts a job with no dispatch yet and no siblings as attempt 1', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:1', 'A game');

    expect(await dispatchAttempt(store, (await store.getSubmission(1))!)).toBe(1);
  });

  it('counts this job’s own dispatches when it has no siblings', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:1', 'A game');
    await store.recordDispatch(1, { backend: 'self', ref: 'r1' });
    await store.recordDispatch(1, { backend: 'self', ref: 'r2' });

    expect(await dispatchAttempt(store, (await store.getSubmission(1))!)).toBe(2);
  });

  it('adds earlier sibling jobs for the same game — an improvement round is a new job', async () => {
    vi.useFakeTimers();
    try {
      // Job 1 is the original game, dispatched twice (built, then one retry).
      vi.setSystemTime(new Date('2026-08-01T10:00:00.000Z'));
      const store = new InMemoryStore();
      await store.createSubmission(1, 'g:1', 'A game');
      await store.setSubmissionSlug(1, 'a-game');
      await store.recordDispatch(1, { backend: 'self', ref: 'r1' });
      await store.recordDispatch(1, { backend: 'self', ref: 'r2' });

      // Job 2: a post-publish improvement, a brand new job.
      vi.setSystemTime(new Date('2026-08-02T10:00:00.000Z'));
      await store.createSubmission(2, 'g:1', 'A game');
      await store.setSubmissionSlug(2, 'a-game');

      const job2 = (await store.getSubmission(2))!;
      expect(job2.dispatch).toBeUndefined();
      // 0 of its own + 2 from job 1, not 1.
      expect(await dispatchAttempt(store, job2)).toBe(2);

      await store.recordDispatch(2, { backend: 'self', ref: 'r3' });
      expect(await dispatchAttempt(store, (await store.getSubmission(2))!)).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores another owner’s job with the same slug', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:1', 'A game');
    await store.setSubmissionSlug(1, 'a-game');
    await store.recordDispatch(1, { backend: 'self', ref: 'r1' });

    await store.createSubmission(2, 'g:2', 'A game');
    await store.setSubmissionSlug(2, 'a-game');

    expect(await dispatchAttempt(store, (await store.getSubmission(2))!)).toBe(1);
  });
});
