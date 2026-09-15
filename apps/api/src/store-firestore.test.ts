import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore } from './platform/store.js';
import { lastRoundActivityAt } from './platform/quiet-round.js';
import { fakeFirestore } from './store/fake-firestore.js';
import { readIncomingTransfersCached } from './creation/transfer-inbox-cache.js';

/**
 * Firestore-shaped tests for `FirestoreStore`.
 *
 * These exist because of a production incident: the first `bot:` account could not be
 * created at all, because `upsertUser` handed Firestore `email: undefined` and Firestore
 * rejects `undefined` rather than treating it as an absent field. Every existing test
 * ran against `InMemoryStore`, which happily stores whatever it is given — so the whole
 * suite was green while the real store could not write the document.
 *
 * `fakeFirestore` (shared with the store parity harness, `store/store-parity.test.ts`)
 * is deliberately strict in exactly the ways that matter: it refuses `undefined` values
 * and nested arrays with the same errors the real client raises. Anything that passes
 * here would have been writable for real.
 */

describe('FirestoreStore.upsertUser', () => {
  it('creates an account that has no email or picture — the bot: case that broke in production', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);

    const user = await store.upsertUser({ uid: 'bot:e2e', name: 'Bot e2e' });

    expect(user.uid).toBe('bot:e2e');
    expect(user.tier).toBe('standard');
    const stored = docs.get(key('users', 'bot:e2e'))!;
    // Absent, not present-and-undefined: that distinction is the whole bug.
    expect('email' in stored).toBe(false);
    expect('picture' in stored).toBe(false);
    expect(stored.name).toBe('Bot e2e');
  });

  it('creates a fully-populated Google account unchanged', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);

    await store.upsertUser({ uid: 'g:1', email: 'a@b.c', name: 'A', picture: 'https://p' });

    expect(docs.get(key('users', 'g:1'))).toMatchObject({ email: 'a@b.c', name: 'A', picture: 'https://p' });
  });

  it('updates an existing account without erasing fields the caller omitted', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);

    await store.upsertUser({ uid: 'g:1', email: 'a@b.c', name: 'A' });
    await store.upsertUser({ uid: 'g:1', activeDays: ['2026-07-27'] });

    const stored = docs.get(key('users', 'g:1'))!;
    expect(stored.email).toBe('a@b.c');
    expect(stored.activeDays).toEqual(['2026-07-27']);
  });
});

describe('FirestoreStore.upsertWaitlistEntry', () => {
  it('accepts an entry with no email — the unverified-Google-email case', async () => {
    // auth.ts deliberately passes undefined rather than store an unverified claim, so
    // this path was a 500 waiting for the first such sign-up.
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);

    const entry = await store.upsertWaitlistEntry({ uid: 'g:2', name: 'No Email' });

    expect(entry.status).toBe('pending');
    const stored = docs.get(key('waitlist', 'g:2'))!;
    expect('email' in stored).toBe(false);
    expect('locale' in stored).toBe(false);
    expect(stored.name).toBe('No Email');
  });

  it('keeps an approved status across a re-submission', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);

    await store.upsertWaitlistEntry({ uid: 'g:3', email: 'a@b.c' });
    docs.set(key('waitlist', 'g:3'), { ...docs.get(key('waitlist', 'g:3'))!, status: 'approved' });

    const entry = await store.upsertWaitlistEntry({ uid: 'g:3', email: 'a@b.c' });
    expect(entry.status).toBe('approved');
  });

  it('lists, counts, and pre-approves by email', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);

    await store.upsertWaitlistEntry({ uid: 'g:1', email: 'one@example.com' });
    await store.upsertWaitlistEntry({ uid: 'g:2', email: 'two@example.com' });
    await store.setWaitlistStatus('g:2', 'approved');

    expect(await store.countWaitlistEntries('pending')).toBe(1);
    expect((await store.listWaitlistEntries({ status: 'pending' })).map((row) => row.uid)).toEqual(['g:1']);

    const created = await store.setWaitlistStatusByEmail('New@Example.com', 'approved');
    expect(created).toMatchObject({
      uid: 'email:new@example.com',
      email: 'new@example.com',
      status: 'approved',
    });
    expect(await store.isWaitlistApproved('g:other', 'new@example.com')).toBe(true);
  });

  it('lowercases emails on join and heals a legacy mixed-case row on approve', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);

    const joined = await store.upsertWaitlistEntry({ uid: 'g:mix', email: 'Friend@Example.com' });
    expect(joined.email).toBe('friend@example.com');
    expect(docs.get(key('waitlist', 'g:mix'))?.email).toBe('friend@example.com');

    // Simulate a row written before normalisation — mixed case still on disk.
    docs.set(key('waitlist', 'g:legacy'), {
      uid: 'g:legacy',
      email: 'Legacy@Example.com',
      requestedAt: '2026-07-01T00:00:00.000Z',
      status: 'pending',
    });

    const healed = await store.setWaitlistStatusByEmail('legacy@example.com', 'approved');
    expect(healed).toMatchObject({ uid: 'g:legacy', email: 'legacy@example.com', status: 'approved' });
    expect(docs.get(key('waitlist', 'g:legacy'))).toMatchObject({
      email: 'legacy@example.com',
      status: 'approved',
    });
    // No duplicate email: row beside the healed join.
    expect([...docs.keys()].filter((k) => k.startsWith('waitlist/'))).toHaveLength(2);
  });
});

describe('FirestoreStore beta invites', () => {
  it('stores only a hash and claims the code through a transaction', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);
    const created = await store.createBetaInvite('g:operator');

    const stored = docs.get(key('betaInvites', created.invite.id))!;
    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored).not.toHaveProperty('code');

    expect(await store.claimBetaInvite(created.code, 'g:first')).toMatchObject({
      ok: true,
      invite: { status: 'claimed', claimedUid: 'g:first' },
    });
    expect(await store.claimBetaInvite(created.code, 'g:second')).toEqual({ ok: false, reason: 'claimed' });
  });
});

describe('FirestoreStore game saves', () => {
  it('stores a save whose contents Firestore could never hold as fields', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    // A 2D grid and an explicit null: the first is impossible as a Firestore array, the
    // second is fine — both survive intact because the blob is written as a string.
    const data = JSON.stringify({
      grid: [
        [1, 2],
        [3, 4],
      ],
      carried: null,
      name: 'Ada',
    });

    await store.putGameSave('g:alice', 'crypt-delver', data, 2);

    const saved = await store.getGameSave('g:alice', 'crypt-delver');
    expect(saved?.data).toBe(data);
    expect(saved?.version).toBe(2);
    expect(saved?.slug).toBe('crypt-delver');
  });

  it('answers null for a player with no save in that game', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.putGameSave('g:alice', 'crypt-delver', '{"level":1}', 1);

    expect(await store.getGameSave('g:alice', 'other-game')).toBeNull();
    expect(await store.getGameSave('g:bob', 'crypt-delver')).toBeNull();
  });

  it('replaces rather than merges, so an old field cannot outlive the shape it belonged to', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);

    await store.putGameSave('g:alice', 'crypt-delver', '{"level":1,"gold":5}', 1);
    await store.putGameSave('g:alice', 'crypt-delver', '{"level":2}', 1);

    expect((await store.getGameSave('g:alice', 'crypt-delver'))?.data).toBe('{"level":2}');
  });

  it('lists and erases one player’s saves without touching another’s', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.putGameSave('g:alice', 'crypt-delver', '{"level":1}', 1);
    await store.putGameSave('g:alice', 'brick-storm', '{"best":9}', 1);
    await store.putGameSave('g:bob', 'crypt-delver', '{"level":3}', 1);

    expect((await store.listGameSaves('g:alice')).map((save) => save.slug).sort()).toEqual([
      'brick-storm',
      'crypt-delver',
    ]);

    expect(await store.deleteGameSaves('g:alice')).toBe(2);
    expect(await store.listGameSaves('g:alice')).toEqual([]);
    expect((await store.getGameSave('g:bob', 'crypt-delver'))?.data).toBe('{"level":3}');
  });

  it('deletes a single game’s save on request', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.putGameSave('g:alice', 'crypt-delver', '{"level":1}', 1);
    await store.putGameSave('g:alice', 'brick-storm', '{"best":9}', 1);

    await store.deleteGameSave('g:alice', 'crypt-delver');

    expect(await store.getGameSave('g:alice', 'crypt-delver')).toBeNull();
    expect(await store.getGameSave('g:alice', 'brick-storm')).not.toBeNull();
  });
});

describe('FirestoreStore game assessments', () => {
  const checklist = { graphics: 'ok', gameplay: 'ok', fun: 'ok', sound: 'ok', controls: 'ok' } as const;

  it('archives the superseded row in the same batch as the replacement', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);

    await store.upsertGameAssessment({
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      source: 'catalog',
      creatorHandle: null,
      reviewerUid: 'g:alice',
      verdict: 'cut',
      note: 'Controls are broken.',
      noteOrigin: 'text',
      checklist: { ...checklist },
      clientContext: null,
      gameVersion: 'v1',
    });
    await store.upsertGameAssessment({
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      source: 'catalog',
      creatorHandle: null,
      reviewerUid: 'g:alice',
      verdict: 'keep',
      note: 'Controls feel great now.',
      noteOrigin: 'text',
      checklist: { ...checklist },
      clientContext: null,
      gameVersion: 'v2',
    });

    const current = await store.getGameAssessment('sky-dodge', 'g:alice');
    expect(current?.verdict).toBe('keep');
    expect(current?.gameVersion).toBe('v2');

    const history = await store.listGameAssessmentHistory('sky-dodge', 'g:alice');
    expect(history).toEqual([expect.objectContaining({ verdict: 'cut', gameVersion: 'v1' })]);
  });

  it('refuses a resolution pinned to a verdict the row has moved past', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    const seed = {
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      source: 'catalog' as const,
      creatorHandle: null,
      reviewerUid: 'g:alice',
      verdict: 'cut' as const,
      note: 'Controls are broken.',
      noteOrigin: 'text' as const,
      checklist: { ...checklist },
      clientContext: null,
    };
    const first = await store.upsertGameAssessment(seed);
    const resolution = {
      status: 'addressed' as const,
      comment: 'Rebuilt the touch controls.',
      link: null,
      resolvedAt: '2026-08-22T00:00:00.000Z',
      resolvedBy: 'g:boss',
    };

    const stale = new Date(Date.parse(first.updatedAt) - 60_000).toISOString();
    expect(await store.setGameAssessmentResolution('sky-dodge', 'g:alice', resolution, stale)).toEqual(
      expect.objectContaining({ status: 'stale' }),
    );
    expect((await store.getGameAssessment('sky-dodge', 'g:alice'))?.resolution).toBeNull();

    const landed = await store.setGameAssessmentResolution('sky-dodge', 'g:alice', resolution, first.updatedAt);
    expect(landed.status).toBe('ok');
    expect((await store.getGameAssessment('sky-dodge', 'g:alice'))?.resolution).toEqual(resolution);

    expect(await store.setGameAssessmentResolution('no-such-game', 'g:alice', resolution)).toEqual({
      status: 'not_found',
    });
  });
});

describe('FirestoreStore shared worlds', () => {
  const claim = (uid: string, key: string, fields: Record<string, string | number | boolean>) => ({
    worldId: 'shared-garden',
    key,
    uid,
    fields,
    maxPerPlayer: 2,
    maxEntries: 100,
  });

  it('stores an entry as real fields, unlike a save', async () => {
    // The inversion that decided the schema: a save is opaque because its shape is the
    // game's business, while a world entry has a declared shape that was validated
    // field by field before it got here — so it is stored as fields Firestore can query.
    const { db, docs } = fakeFirestore();
    const store = new FirestoreStore(db);

    const result = await store.putWorldEntry(claim('g:alice', 'plot.1', { plant: 'oak', height: 3 }));

    expect(result).toMatchObject({ ok: true });
    expect(docs.get('worlds/shared-garden/worldEntries/plot.1')).toMatchObject({
      fields: { plant: 'oak', height: 3 },
      ownerUid: 'g:alice',
    });
    expect((await store.getWorldEntry('shared-garden', 'plot.1'))?.fields.plant).toBe('oak');
  });

  it('gives the first writer of a key ownership of it', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.putWorldEntry(claim('g:alice', 'plot.1', { plant: 'oak' }));

    const stolen = await store.putWorldEntry(claim('g:bob', 'plot.1', { plant: 'fern' }));

    expect(stolen).toEqual({ ok: false, reason: 'conflict' });
    expect((await store.getWorldEntry('shared-garden', 'plot.1'))?.fields.plant).toBe('oak');
  });

  it('keeps createdAt across an owner’s edits and refreshes updatedAt', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.putWorldEntry(claim('g:alice', 'plot.1', { plant: 'oak' }));
    const first = await store.getWorldEntry('shared-garden', 'plot.1');

    await store.putWorldEntry(claim('g:alice', 'plot.1', { plant: 'fern' }));
    const second = await store.getWorldEntry('shared-garden', 'plot.1');

    expect(second?.createdAt).toBe(first?.createdAt);
    expect(second?.fields.plant).toBe('fern');
  });

  it('replaces rather than merges, so a field cannot outlive the shape it belonged to', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.putWorldEntry(claim('g:alice', 'plot.1', { plant: 'oak', height: 3 }));
    await store.putWorldEntry(claim('g:alice', 'plot.1', { plant: 'oak' }));

    expect(await store.getWorldEntry('shared-garden', 'plot.1')).toMatchObject({ fields: { plant: 'oak' } });
  });

  it('holds a player to their quota, and charges nothing for editing what they own', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.putWorldEntry(claim('g:alice', 'plot.1', { plant: 'oak' }));
    await store.putWorldEntry(claim('g:alice', 'plot.2', { plant: 'oak' }));

    expect(await store.putWorldEntry(claim('g:alice', 'plot.3', { plant: 'oak' }))).toEqual({
      ok: false,
      reason: 'quota',
    });
    // Re-editing an owned entry cannot change the total, so it must not be refused.
    expect(await store.putWorldEntry(claim('g:alice', 'plot.1', { plant: 'fern' }))).toMatchObject({ ok: true });
    // And the quota is per person: another player is unaffected.
    expect(await store.putWorldEntry(claim('g:bob', 'plot.3', { plant: 'oak' }))).toMatchObject({ ok: true });
    expect(await store.countWorldEntries('shared-garden', 'g:alice')).toBe(2);
  });

  it('refuses to grow a world past the platform ceiling', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.putWorldEntry({ ...claim('g:alice', 'plot.1', { plant: 'oak' }), maxEntries: 1 });

    const full = await store.putWorldEntry({ ...claim('g:bob', 'plot.2', { plant: 'oak' }), maxEntries: 1 });
    expect(full).toEqual({ ok: false, reason: 'full' });
  });

  it('deletes only an entry its owner asks about', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.putWorldEntry(claim('g:alice', 'plot.1', { plant: 'oak' }));

    expect(await store.deleteWorldEntry('shared-garden', 'plot.1', 'g:bob')).toBe(false);
    expect(await store.deleteWorldEntry('shared-garden', 'missing', 'g:alice')).toBe(false);
    expect(await store.deleteWorldEntry('shared-garden', 'plot.1', 'g:alice')).toBe(true);
    expect(await store.getWorldEntry('shared-garden', 'plot.1')).toBeNull();
  });

  it('lists a whole world, whoever built it', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.putWorldEntry(claim('g:alice', 'plot.1', { plant: 'oak' }));
    await store.putWorldEntry(claim('g:bob', 'plot.2', { plant: 'fern' }));

    const entries = await store.listWorldEntries('shared-garden');
    expect(entries.map((entry) => entry.key).sort()).toEqual(['plot.1', 'plot.2']);
  });

  it('erases one person across every world without touching anybody else', async () => {
    // The collection-group path, which is the one that needs an index in production —
    // there is no list of which worlds a person built in, so erasure has to sweep.
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.putWorldEntry(claim('g:alice', 'plot.1', { plant: 'oak' }));
    await store.putWorldEntry({ ...claim('g:alice', 'stall.1', { plant: 'oak' }), worldId: 'market-square' });
    await store.putWorldEntry(claim('g:bob', 'plot.2', { plant: 'fern' }));

    expect(await store.listWorldsForUser('g:alice')).toEqual(['market-square', 'shared-garden']);
    expect(await store.deleteWorldEntriesForUser('g:alice')).toBe(2);

    expect(await store.listWorldsForUser('g:alice')).toEqual([]);
    expect((await store.listWorldEntries('shared-garden')).map((entry) => entry.key)).toEqual(['plot.2']);
    expect(await store.listWorldEntries('market-square')).toEqual([]);
  });

  it('reports nothing to erase for somebody who never built anything', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    expect(await store.listWorldsForUser('g:nobody')).toEqual([]);
    expect(await store.deleteWorldEntriesForUser('g:nobody')).toBe(0);
  });
});

describe('FirestoreStore.createOAuthGrant', () => {
  it('rejects a duplicate grantId, atomically -- the refresh-token write does not land either', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);

    await store.createOAuthGrant({
      grantId: 'dup-grant',
      clientId: 'client-1',
      ownerUid: 'g:user-1',
      scope: 'mcp',
      createdAt: '2026-08-22T00:00:00Z',
      refreshFamilyId: 'family-a',
      currentRefreshTokenId: 'refresh-a',
      currentRefreshHash: 'hash-a',
      refreshExpiresAt: '2026-09-22T00:00:00Z',
    });

    await expect(
      store.createOAuthGrant({
        grantId: 'dup-grant',
        clientId: 'client-1',
        ownerUid: 'g:user-2',
        scope: 'mcp',
        createdAt: '2026-08-22T00:01:00Z',
        refreshFamilyId: 'family-b',
        currentRefreshTokenId: 'refresh-b',
        currentRefreshHash: 'hash-b',
        refreshExpiresAt: '2026-09-22T00:01:00Z',
      }),
    ).rejects.toThrow(/already exists/);

    // The failed create's sibling set() must not have landed either.
    expect(await store.getOAuthGrantByRefreshTokenId('refresh-b')).toBeNull();
    // The original grant is untouched, not overwritten by the failed attempt.
    expect(await store.getOAuthGrant('dup-grant')).toMatchObject({ ownerUid: 'g:user-1' });
  });
});

describe('the fake itself', () => {
  it('rejects a nested array the way the real client does', () => {
    // If this ever stops throwing, the argument for storing saves as a string has
    // quietly lost its evidence — and the test above would pass for the wrong reason.
    const { db } = fakeFirestore();
    return expect(
      db
        .collection('users')
        .doc('x')
        .set({ grid: [[1, 2]] } as never),
    ).rejects.toThrow(/Cannot use "array" as an array value/);
  });

  it('rejects undefined the way the real client does, so these tests can fail', () => {
    // Guards against the fake quietly accepting everything, which would make every
    // assertion above meaningless.
    const { db } = fakeFirestore();
    return expect(
      db
        .collection('users')
        .doc('x')
        .set({ email: undefined } as never),
    ).rejects.toThrow(/Cannot use "undefined" as a Firestore value/);
  });

  it('orders by a field, ascending and descending', async () => {
    const { db } = fakeFirestore();
    const col = db.collection('items');
    await col.doc('a').set({ n: 3 });
    await col.doc('b').set({ n: 1 });
    await col.doc('c').set({ n: 2 });

    const asc = await col.orderBy('n', 'asc').get();
    expect(asc.docs.map((doc) => doc.id)).toEqual(['b', 'c', 'a']);

    const desc = await col.orderBy('n', 'desc').get();
    expect(desc.docs.map((doc) => doc.id)).toEqual(['a', 'c', 'b']);
  });

  it('supports range operators, the way listAccountsDueForDeletion needs', async () => {
    const { db } = fakeFirestore();
    const col = db.collection('items');
    await col.doc('a').set({ n: 1 });
    await col.doc('b').set({ n: 2 });
    await col.doc('c').set({ n: 3 });

    expect((await col.where('n', '<', 2).get()).docs.map((doc) => doc.id)).toEqual(['a']);
    expect((await col.where('n', '<=', 2).get()).docs.map((doc) => doc.id)).toEqual(['a', 'b']);
    expect((await col.where('n', '>', 2).get()).docs.map((doc) => doc.id)).toEqual(['c']);
    expect((await col.where('n', '>=', 2).get()).docs.map((doc) => doc.id)).toEqual(['b', 'c']);
  });

  it('excludes documents missing the range-filtered field, like listAccountsDueForDeletion', async () => {
    // A user who was never scheduled for deletion has no `deletionScheduledFor` at all --
    // real Firestore excludes it from a `<=` query rather than treating the gap as a match.
    const { db } = fakeFirestore();
    const col = db.collection('users');
    await col.doc('scheduled').set({ deletionScheduledFor: '2026-01-01' });
    await col.doc('untouched').set({ name: 'still here' });

    const found = await col.where('deletionScheduledFor', '<=', '2026-06-01').get();
    expect(found.docs.map((doc) => doc.id)).toEqual(['scheduled']);
  });

  it('excludes documents missing the orderBy field too, not just range-filtered ones', async () => {
    const { db } = fakeFirestore();
    const col = db.collection('items');
    await col.doc('has-field').set({ n: 1 });
    await col.doc('no-field').set({ other: 'x' });

    const found = await col.orderBy('n', 'asc').get();
    expect(found.docs.map((doc) => doc.id)).toEqual(['has-field']);
  });

  it('resolves dotted field paths, the way listSeedOutcomesSince reads seedOutcome.at', async () => {
    const { db } = fakeFirestore();
    const col = db.collection('submissions');
    await col.doc('1').set({ seedOutcome: { at: '2026-01-01' } });
    await col.doc('2').set({ seedOutcome: { at: '2026-03-01' } });
    await col.doc('3').set({ other: 'no seedOutcome at all' });

    const found = await col.where('seedOutcome.at', '>=', '2026-02-01').orderBy('seedOutcome.at', 'desc').get();
    expect(found.docs.map((doc) => doc.id)).toEqual(['2']);
  });

  it('supports "in", the way listSuggestions/listProposals filter by status set', async () => {
    const { db } = fakeFirestore();
    const col = db.collection('items');
    await col.doc('a').set({ status: 'open' });
    await col.doc('b').set({ status: 'closed' });
    await col.doc('c').set({ status: 'archived' });

    const found = await col.where('status', 'in', ['open', 'archived']).get();
    expect(found.docs.map((doc) => doc.id).sort()).toEqual(['a', 'c']);
  });

  it('select() restricts returned fields, the way build-shot/preview listings depend on', async () => {
    const { db } = fakeFirestore();
    await db.collection('items').doc('a').set({ id: 'a', label: 'Shot', data: 'heavy-payload' });

    const snap = await db.collection('items').select('id', 'label').get();
    expect(snap.docs[0]?.data()).toEqual({ id: 'a', label: 'Shot' });
  });

  it('chains select().orderBy().limit() in listBuildShots order', async () => {
    const { db } = fakeFirestore();
    const col = db.collection('items');
    await col.doc('a').set({ id: 'a', createdAt: '2026-01-01', data: 'heavy' });
    await col.doc('b').set({ id: 'b', createdAt: '2026-01-03', data: 'heavy' });
    await col.doc('c').set({ id: 'c', createdAt: '2026-01-02', data: 'heavy' });

    const snap = await col.select('id', 'createdAt').orderBy('createdAt', 'desc').limit(2).get();
    expect(snap.docs.map((doc) => doc.data())).toEqual([
      { id: 'b', createdAt: '2026-01-03' },
      { id: 'c', createdAt: '2026-01-02' },
    ]);
  });

  it('startAfter pages through every row exactly once, cursor-style', async () => {
    // Mirrors listSuggestions/listProposals: no orderBy, paged by a doc cursor rather
    // than a single limit, because an unbounded caller must see every match.
    const { db } = fakeFirestore();
    const col = db.collection('items');
    for (const id of ['a', 'b', 'c', 'd', 'e']) await col.doc(id).set({ id });

    const seen: string[] = [];
    let cursor: { id: string } | undefined;
    for (;;) {
      const page = cursor ? col.startAfter(cursor).limit(2) : col.limit(2);
      const snap = await page.get();
      if (snap.empty) break;
      seen.push(...snap.docs.map((doc) => doc.id));
      if (snap.docs.length < 2) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

/**
 * The creation breaker's two documents. Worth Firestore-shaped coverage for the reason at
 * the top of this file: the in-memory store accepts anything, and these are written by an
 * operator under incident conditions — the worst time to discover a rejected write.
 */
describe('FirestoreStore creation limits', () => {
  it('writes the breaker with no undefined fields, cap included', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);

    const limits = await store.setCreationLimits({ paused: true, globalDailySubmissionCap: 25 }, 'g:boss');

    expect(limits).toMatchObject({ paused: true, globalDailySubmissionCap: 25, updatedBy: 'g:boss' });
    expect(docs.get(key('opsConfig', 'creationLimits'))).toMatchObject({ paused: true, globalDailySubmissionCap: 25 });
  });

  it('stores a cleared cap as null rather than as an absent field', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);

    // Firestore refuses `undefined`, and "no stored ceiling" has to survive the round
    // trip as an explicit null or the reader cannot tell it from a missing document.
    await store.setCreationLimits({ paused: false, globalDailySubmissionCap: null }, 'g:boss');

    expect(docs.get(key('opsConfig', 'creationLimits'))!.globalDailySubmissionCap).toBeNull();
    expect(await store.getCreationLimits()).toMatchObject({ paused: false, globalDailySubmissionCap: null });
  });

  it('merges a partial change rather than dropping the other field', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);

    await store.setCreationLimits({ paused: true, globalDailySubmissionCap: 25 }, 'g:boss');
    await store.setCreationLimits({ paused: false }, 'g:boss');

    expect(await store.getCreationLimits()).toMatchObject({ paused: false, globalDailySubmissionCap: 25 });
  });

  it('answers null before anyone has set a breaker', async () => {
    const { db } = fakeFirestore();
    expect(await new FirestoreStore(db).getCreationLimits()).toBeNull();
  });

  it('counts the day’s submissions globally and stops at the cap', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);

    expect(await store.checkAndIncrementGlobalSubmissions('2026-07-30', 2)).toEqual({ allowed: true, current: 1 });
    expect(await store.checkAndIncrementGlobalSubmissions('2026-07-30', 2)).toEqual({ allowed: true, current: 2 });
    expect(await store.checkAndIncrementGlobalSubmissions('2026-07-30', 2)).toEqual({ allowed: false, current: 2 });

    expect(await store.getGlobalSubmissionCount('2026-07-30')).toBe(2);
    // One document per UTC day, so yesterday's spend can never refuse today's request.
    expect(await store.getGlobalSubmissionCount('2026-07-29')).toBe(0);
    expect(docs.get(key('globalUsage', '2026-07-30'))).toMatchObject({ submissions: 2 });
  });
});

describe('FirestoreStore.markCreatorMessagesDelivered', () => {
  it('delivers a real message', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);

    const message = await store.appendCreatorMessage(9, 'make it faster');
    await store.markCreatorMessagesDelivered(9, [message.id]);

    const [stored] = await store.listCreatorMessages(9);
    expect(stored.deliveredAt).not.toBeNull();
    expect(stored.text).toBe('make it faster');
  });

  it('does not materialize a phantom message for an id that was never appended', async () => {
    // Production incident: a stale/bogus ack_inbox id used to `set(..., {merge: true})`
    // a brand-new document with only `deliveredAt` and no `text` — every later reader
    // of the thread crashed on that missing field.
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);

    await store.markCreatorMessagesDelivered(9, ['never-appended']);

    expect(docs.has(key('submissions/9/messages', 'never-appended'))).toBe(false);
    expect(await store.listCreatorMessages(9)).toEqual([]);
  });
});

describe('sharded spend counters', () => {
  it('spreads writes across shards instead of one hot document', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);

    for (let i = 0; i < 40; i += 1) {
      await store.checkAndIncrementGlobalSearchEmbeddings('2026-08-30', 1000);
    }

    // Firestore takes about one write per second per document; a per-keystroke
    // counter on a single doc is the bottleneck exactly when a runaway is on.
    const touched = [...docs.keys()].filter((k) => k.includes('searchEmbeddings'));
    expect(touched.length).toBeGreaterThan(1);
    expect(await store.getGlobalSearchEmbeddingCount('2026-08-30')).toBe(40);
    // The day's single document is not where this lands any more.
    expect(docs.get(key('globalUsage', '2026-08-30'))?.searchEmbeddings).toBeUndefined();
  });

  it('still refuses at the cap, and counts moderation the same way', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);

    let admitted = 0;
    for (let i = 0; i < 40; i += 1) {
      if ((await store.checkAndIncrementGlobalSearchEmbeddings('2026-08-30', 20)).allowed) admitted += 1;
    }
    // Shard ceilings sum to the ceiling; skew can refuse sooner, never later.
    expect(admitted).toBeGreaterThan(0);
    expect(admitted).toBeLessThanOrEqual(20);

    await store.incrementGlobalModerationCalls('2026-08-30', 3);
    await store.incrementGlobalModerationCalls('2026-08-30', 2);
    expect(await store.getGlobalModerationCount('2026-08-30')).toBe(5);
  });
});

describe.each([
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore', () => new FirestoreStore(fakeFirestore().db)],
])('%s.recordJobTransition guard', (_name, make) => {
  it('refuses the close when the round moved since the sweep read it', async () => {
    const store = make();
    // Stamps run forward from the wall clock: createSubmission stamps roundStartedAt with it.
    const HOUR = 60 * 60 * 1000;
    const base = Date.now();
    const at = (ms: number) => new Date(base + ms).toISOString();
    await store.createSubmission(9, 'g:owner', 'Racing');
    await store.recordJobTransition(9, { to: 'building', at: at(HOUR), by: 'system' });
    const seen = lastRoundActivityAt((await store.getSubmission(9))!);
    // Something happened after the read: the agent delivered.
    await store.recordJobTransition(9, { to: 'submitted', at: at(2 * HOUR), by: 'agent' });

    const stale = { to: 'abandoned' as const, at: at(15 * 24 * HOUR), by: 'system' as const, reason: 'quiet' };
    expect(await store.recordJobTransition(9, stale, { activityAt: seen })).toBe(false);
    expect((await store.getSubmission(9))?.state).toBe('submitted');

    // The claim with the current stamp goes through.
    const fresh = lastRoundActivityAt((await store.getSubmission(9))!);
    expect(fresh).toBeGreaterThan(seen);
    expect(await store.recordJobTransition(9, stale, { activityAt: fresh })).toBe(true);
    expect((await store.getSubmission(9))?.state).toBe('abandoned');
  });

  it('lists a notified change-request round as open, which the sweep filter does not', async () => {
    const store = make();
    await store.createSubmission(10, 'g:owner', 'Told');
    await store.recordJobTransition(10, { to: 'needs_changes', at: '2026-07-01T00:00:00.000Z', by: 'gate' });
    await store.setSubmissionNotifiedStatus(10, 'needs_changes');
    expect((await store.listActiveSubmissions()).map((r) => r.jobId)).toEqual([]);
    expect((await store.listOpenRounds()).map((r) => r.jobId)).toEqual([10]);
    await store.setSubmissionAbandoned(10, '2026-07-16T00:00:00.000Z');
    expect(await store.listOpenRounds()).toEqual([]);
  });
});

// Runs `onFirstRead` once the first query resolves, whatever the chain.
function racingAfterFirstRead<T extends object>(target: T, onFirstRead: () => void): T {
  let fired = false;
  const wrap = (value: unknown): unknown => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return value;
    return new Proxy(value as object, {
      get(object, property, receiver) {
        const inner = Reflect.get(object, property, receiver) as unknown;
        if (typeof inner !== 'function') return inner;
        if (property === 'get') {
          return async (...args: unknown[]) => {
            const result: unknown = await (inner as (...a: unknown[]) => unknown).apply(object, args);
            if (!fired) {
              fired = true;
              onFirstRead();
            }
            return result;
          };
        }
        return (...args: unknown[]) => wrap((inner as (...a: unknown[]) => unknown).apply(object, args));
      },
    }) as unknown;
  };
  return wrap(target) as T;
}

/**
 * The strip filters proposal shots out after the read, so the read pages until enough
 * survive. Counting them first and over-fetching by that many is two reads with nothing
 * holding them together: a proposal written in the gap left the count short and the
 * window under-fetched. At `limit: 1`, the round card's read, the strip came back empty.
 */
describe('FirestoreStore.listBuildShots', () => {
  it('still fills the page when a proposal lands between reads', async () => {
    const { db, docs, key } = fakeFirestore();
    await new FirestoreStore(db).appendBuildShot(31, { data: 'AAA=', mediaType: 'image/png', label: 'Opening' });

    const store = new FirestoreStore(
      racingAfterFirstRead(db, () => {
        docs.set(key('submissions/31/shots', 'late'), {
          id: 'late',
          label: 'AI concept',
          mediaType: 'image/png',
          createdAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }),
    );

    const strip = await store.listBuildShots(31, { limit: 1, excludeLabels: ['AI concept'] });

    expect(strip.map((item) => item.label)).toEqual(['Opening']);
  });
});

/**
 * The quota is one number, so it comes from one snapshot. It used to be a total
 * aggregate minus a labelled one: proposals landing between them left a stale total and
 * a fresh excluded count, and the difference told the upload route it had room it did
 * not have.
 */
describe('FirestoreStore.countBuildShots', () => {
  it('does not undercount when proposals land between reads', async () => {
    const { db, docs, key } = fakeFirestore();
    const seed = new FirestoreStore(db);
    for (let index = 0; index < 4; index += 1) {
      await seed.appendBuildShot(41, { data: 'AAA=', mediaType: 'image/png', label: `Shot ${index}` });
    }

    const store = new FirestoreStore(
      racingAfterFirstRead(db, () => {
        for (let index = 0; index < 3; index += 1) {
          docs.set(key('submissions/41/shots', `proposal-${index}`), {
            id: `proposal-${index}`,
            label: 'AI concept',
            mediaType: 'image/png',
            createdAt: new Date().toISOString(),
          });
        }
      }),
    );

    // Four agent shots exist; three proposals appear mid-count and must not subtract.
    expect(await store.countBuildShots(41, { excludeLabels: ['AI concept'] })).toBe(4);
  });
});

// Checks for an existing code inside the mint transaction, not before it.
describe('FirestoreStore.ensureRecipientCode', () => {
  it('does not mint a second code once one already exists', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.upsertUser({ uid: 'g:ada' });
    const first = await store.ensureRecipientCode('g:ada', '2026-01-01T00:00:00.000Z');

    const second = await store.ensureRecipientCode('g:ada', '2026-01-01T00:00:01.000Z');

    expect(second).toBe(first);
    expect((await store.getUserByRecipientCode(first!))?.uid).toBe('g:ada');
  });

  it('refuses to mint or rotate once the erasure fence is set, before cleanup runs', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.upsertUser({ uid: 'g:ada' });
    await store.beginAccountErasure('g:ada', '2026-01-01T00:00:00.000Z');

    expect(await store.ensureRecipientCode('g:ada', '2026-01-02T00:00:00.000Z')).toBeNull();
    expect(await store.rotateRecipientCode('g:ada', '2026-01-02T00:00:00.000Z')).toBeNull();
  });

  it('stops returning an existing code once erasure begins, before cleanup removes it', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.upsertUser({ uid: 'g:ada' });
    await store.ensureRecipientCode('g:ada', '2026-01-01T00:00:00.000Z');

    await store.beginAccountErasure('g:ada', '2026-01-02T00:00:00.000Z');

    expect(await store.ensureRecipientCode('g:ada', '2026-01-03T00:00:00.000Z')).toBeNull();
  });
});

describe('FirestoreStore.deleteAccountIdentity', () => {
  it('retires the recipient code and scrubs transfer invitations naming the uid', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    const code = await store.ensureRecipientCode('g:grace', '2026-01-01T00:00:00.000Z');
    await store.ensureGameAccess('sky', 'g:ada', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, '2026-01-01T00:00:00.000Z');

    await store.deleteAccountIdentity('g:grace', '2026-01-02T00:00:00.000Z');

    expect(await store.getUserByRecipientCode(code!)).toBeNull();
    expect(await store.getActiveGameTransfer('sky', '2026-01-02T00:00:00.000Z')).toBeNull();
  });

  it("drops the recipient's cached inbox entry when the sender is erased mid-window", async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.ensureGameAccess('sky', 'g:ada', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, '2026-01-01T00:00:00.000Z');
    const clock = () => Date.now();
    expect(await readIncomingTransfersCached(store, 'g:grace', '2026-01-01T00:00:00.000Z', clock)).toHaveLength(1);

    await store.deleteAccountIdentity('g:ada', '2026-01-02T00:00:00.000Z');

    expect(await readIncomingTransfersCached(store, 'g:grace', '2026-01-02T00:00:00.000Z', clock)).toHaveLength(0);
  });

  it('leaves the account retryable if transfer cleanup fails before the user is deleted', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.ensureGameAccess('sky', 'g:ada', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, '2026-01-01T00:00:00.000Z');

    // Call 2, not 1: eraseMemberFromAllGameAccess's own transaction runs first.
    let calls = 0;
    const flaky = {
      ...db,
      runTransaction: (fn: (tx: unknown) => Promise<unknown>) => {
        calls += 1;
        if (calls === 2) return Promise.reject(new Error('transient'));
        return db.runTransaction(fn);
      },
    };
    const flakyStore = new FirestoreStore(flaky as typeof db);

    await expect(flakyStore.deleteAccountIdentity('g:ada', '2026-01-02T00:00:00.000Z')).rejects.toThrow('transient');
    expect(docs.get(key('users', 'g:ada'))).toBeDefined();

    await store.deleteAccountIdentity('g:ada', '2026-01-03T00:00:00.000Z');
    expect(docs.get(key('users', 'g:ada'))).toBeUndefined();
    expect(await store.getActiveGameTransfer('sky', '2026-01-03T00:00:00.000Z')).toBeNull();
  });

  it('deletes the recipient code in the same batch as the user, not a later one', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.upsertUser({ uid: 'g:ada' });
    const code = await store.ensureRecipientCode('g:ada', '2026-01-01T00:00:00.000Z');

    // Pad past the 450-op batch cap so cleanup spans two commits.
    for (let i = 0; i < 445; i++) {
      docs.set(key('submissions', `job-${i}`), { ownerUid: 'g:ada' });
    }

    // The second batch.commit() fails, after the first has already applied.
    let batches = 0;
    const flaky = {
      ...db,
      batch: () => {
        batches += 1;
        const real = db.batch();
        return batches === 2 ? { ...real, commit: () => Promise.reject(new Error('transient')) } : real;
      },
    };
    const flakyStore = new FirestoreStore(flaky as typeof db);

    await expect(flakyStore.deleteAccountIdentity('g:ada', '2026-01-02T00:00:00.000Z')).rejects.toThrow('transient');

    expect(docs.get(key('users', 'g:ada'))).toBeUndefined();
    expect(docs.get(key('recipientCodes', code!))).toBeUndefined();
  });

  it('retires a code another instance minted after this instance cached the user', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.upsertUser({ uid: 'g:grace' });
    await store.getUser('g:grace'); // primes this instance's 30s user cache with no code

    // Another instance rotates the code without this one ever hearing about it.
    docs.set(key('users', 'g:grace'), { ...docs.get(key('users', 'g:grace')), recipientCode: 'rc_fromOtherInstance' });
    docs.set(key('recipientCodes', 'rc_fromOtherInstance'), { uid: 'g:grace', createdAt: '2026-01-01T00:00:00.000Z' });

    await store.deleteAccountIdentity('g:grace', '2026-01-02T00:00:00.000Z');

    expect(await store.getUserByRecipientCode('rc_fromOtherInstance')).toBeNull();
  });

  it('refuses to create an invitation naming an already-erased participant', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.deleteAccountIdentity('g:grace', '2026-01-01T00:00:00.000Z');

    const result = await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, '2026-01-02T00:00:00.000Z');

    expect(result).toBe('ineligible');
  });

  it('refuses to create when ownership settled to someone else after the caller read it', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.ensureGameAccess('sky', 'g:ada', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    // A settlement lands between the route's resolveGameAccess read and this call.
    await store.recordSettledOwner('sky', 'g:grace', 2, '2026-01-01T00:00:00.000Z', '2026-01-01T12:00:00.000Z');

    const result = await store.createGameTransferInvitation('sky', 'g:ada', 'g:mallory', 1, '2026-01-02T00:00:00.000Z');

    expect(result).toBe('stale_owner');
  });

  it('refuses to create when the recipient was blocked after the route looked them up', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.ensureGameAccess('sky', 'g:ada', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    // A block lands between the route's code lookup and this call.
    await store.upsertUser({ uid: 'g:grace', tier: 'blocked' });

    const result = await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, '2026-01-02T00:00:00.000Z');

    expect(result).toBe('ineligible');
  });

  it('refuses to create when the recipient rotated the submitted code after it was looked up', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.ensureGameAccess('sky', 'g:ada', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    const oldCode = (await store.ensureRecipientCode('g:grace', '2026-01-01T00:00:00.000Z'))!;
    // Rotation lands between the route's code lookup and this call.
    await store.rotateRecipientCode('g:grace', '2026-01-01T00:00:00.000Z');

    const result = await store.createGameTransferInvitation(
      'sky',
      'g:ada',
      'g:grace',
      1,
      '2026-01-02T00:00:00.000Z',
      oldCode,
    );

    expect(result).toBe('ineligible');
  });

  it('refuses to create when there is no canonical access record yet, even at revision 0', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });

    const result = await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 0, '2026-01-01T00:00:00.000Z');

    expect(result).toBe('stale_owner');
  });

  it('a pending invitation from a superseded owner does not block the new owner', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.ensureGameAccess('sky', 'g:ada', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:mallory', 1, '2026-01-01T00:00:00.000Z');

    await store.recordSettledOwner('sky', 'g:grace', 2, '2026-01-01T00:00:00.000Z', '2026-01-01T12:00:00.000Z');

    const fresh = await store.createGameTransferInvitation(
      'sky',
      'g:grace',
      'g:someone-else',
      2,
      '2026-01-02T00:00:00.000Z',
    );

    expect(fresh).not.toBe('busy');
    if (typeof fresh === 'string') throw new Error('unreachable');
    expect(fresh.senderUid).toBe('g:grace');
  });
});

describe('FirestoreStore.acceptGameTransferInvitation', () => {
  async function pendingInvite(store: FirestoreStore, at = '2026-01-01T00:00:00.000Z') {
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.ensureGameAccess('sky', 'g:ada', at, at);
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, at);
  }

  it('commits ownership and bumps the access revision when idle', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await pendingInvite(store);

    const result = await store.acceptGameTransferInvitation('sky', 'g:grace', '2026-01-02T00:00:00.000Z');
    if (typeof result === 'string' || result === null) throw new Error('unreachable');
    expect(result.status).toBe('accepted');

    const access = await store.getGameAccess('sky');
    expect(access).toMatchObject({ ownerUid: 'g:grace', accessRevision: 2 });
  });

  it('revokes the sender’s round capabilities in the same transaction', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.createSubmission(4242, 'g:ada', 'Sky');
    await store.setSubmissionSlug(4242, 'sky');
    await pendingInvite(store);
    const before = (await store.bumpRoundGeneration(4242)) ?? 0;

    await store.acceptGameTransferInvitation('sky', 'g:grace', '2026-01-02T00:00:00.000Z');

    // Two ahead: one would still leave the sender a terminal receipt.
    expect((await store.getSubmission(4242))?.roundGeneration).toBe(before + 2);
  });

  it('retires the sender’s agent key lock so the recipient can open self-build rounds', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await pendingInvite(store);
    await store.ensureGameAgentKey('sky', 'g:ada', '2026-01-01T00:00:00.000Z');

    await store.acceptGameTransferInvitation('sky', 'g:grace', '2026-01-02T00:00:00.000Z');

    expect(await store.getGameAgentKey('sky')).toBeNull();
    expect(await store.ensureGameAgentKey('sky', 'g:grace', '2026-01-02T00:00:00.000Z')).toMatchObject({
      ownerUid: 'g:grace',
    });
  });

  it('resets autonomy consent so the recipient inherits no standing consent', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await pendingInvite(store);
    await store.setGameAutonomy('sky', 'auto-fix-defects');

    await store.acceptGameTransferInvitation('sky', 'g:grace', '2026-01-02T00:00:00.000Z');

    expect(await store.getGameAutonomy('sky')).toBeNull();
  });

  it('is idempotent: accepting twice returns the same accepted invitation', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await pendingInvite(store);
    await store.acceptGameTransferInvitation('sky', 'g:grace', '2026-01-02T00:00:00.000Z');

    const again = await store.acceptGameTransferInvitation('sky', 'g:grace', '2026-01-02T00:00:00.000Z');
    if (typeof again === 'string' || again === null) throw new Error('unreachable');
    expect(again.status).toBe('accepted');
    expect((await store.getGameAccess('sky'))?.accessRevision).toBe(2);
  });

  it('refuses when someone other than the recipient tries to accept', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await pendingInvite(store);

    expect(await store.acceptGameTransferInvitation('sky', 'g:mallory', '2026-01-02T00:00:00.000Z')).toBeNull();
  });

  it('leaves ownership unchanged when a build round is active', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await pendingInvite(store);
    await store.createSubmission(1, 'g:ada', 'Sky');
    await store.setSubmissionSlug(1, 'sky');
    await store.recordJobTransition(1, { to: 'building', at: '2026-01-02T00:00:00.000Z', by: 'creator' });

    const result = await store.acceptGameTransferInvitation('sky', 'g:grace', '2026-01-02T00:00:00.000Z');
    expect(result).toBe('busy');
    expect((await store.getGameAccess('sky'))?.ownerUid).toBe('g:ada');
  });

  it('refuses when canonical ownership moved since the invitation was created', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await pendingInvite(store);
    await store.recordSettledOwner('sky', 'g:mallory', 2, '2026-01-01T00:00:00.000Z', '2026-01-01T12:00:00.000Z');

    const result = await store.acceptGameTransferInvitation('sky', 'g:grace', '2026-01-02T00:00:00.000Z');
    expect(result).toBe('stale_owner');
  });

  it('refuses when the recipient became ineligible after the invitation was created', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await pendingInvite(store);
    await store.upsertUser({ uid: 'g:grace', tier: 'blocked' });

    const result = await store.acceptGameTransferInvitation('sky', 'g:grace', '2026-01-02T00:00:00.000Z');
    expect(result).toBe('ineligible');
  });

  it('refuses to accept once the invitation has expired', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await pendingInvite(store);

    const result = await store.acceptGameTransferInvitation('sky', 'g:grace', '2026-01-09T00:00:00.000Z');
    expect(result).toBeNull();
  });

  it('leaves ownership unchanged while a round is still opening (no submission yet)', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await pendingInvite(store);
    // The sender holds the round-opening lease with no submission yet.
    await store.beginCheckoutRecovery('sky', 'nonce-1', Date.parse('2026-01-02T00:00:00.000Z'));

    const busy = await store.acceptGameTransferInvitation('sky', 'g:grace', '2026-01-02T00:00:00.000Z');
    expect(busy).toBe('busy');
    expect((await store.getGameAccess('sky'))?.ownerUid).toBe('g:ada');

    await store.finishCheckoutRecovery('sky', 'nonce-1');
    const result = await store.acceptGameTransferInvitation('sky', 'g:grace', '2026-01-02T00:00:00.000Z');
    if (typeof result === 'string' || result === null) throw new Error('unreachable');
    expect(result.status).toBe('accepted');
    expect((await store.getGameAccess('sky'))?.ownerUid).toBe('g:grace');
  });
});

// A stale-only page can hide an active invite.
describe('FirestoreStore.listPendingGameTransfersForRecipient', () => {
  it('pages past more stale invitations than fit in one page to find the active one', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await store.upsertUser({ uid: 'g:grace' });

    for (let i = 0; i < 250; i += 1) {
      await store.upsertUser({ uid: `g:owner-${i}` });
      await store.ensureGameAccess(
        `stale-${i}`,
        `g:owner-${i}`,
        '2020-01-01T00:00:00.000Z',
        '2020-01-01T00:00:00.000Z',
      );
      await store.createGameTransferInvitation(`stale-${i}`, `g:owner-${i}`, 'g:grace', 1, '2020-01-01T00:00:00.000Z');
    }
    await store.upsertUser({ uid: 'g:ada' });
    await store.ensureGameAccess('sky', 'g:ada', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, '2026-01-01T00:00:00.000Z');

    const pending = await store.listPendingGameTransfersForRecipient('g:grace', '2026-01-02T00:00:00.000Z');

    expect(pending.map((t) => t.slug)).toEqual(['sky']);
  });
});
