import { describe, expect, it } from 'vitest';
import { FirestoreStore } from './store.js';
import { fakeFirestore } from './store/fake-firestore.js';

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
