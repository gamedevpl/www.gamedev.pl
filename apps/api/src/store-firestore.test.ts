import type { Firestore } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';
import { FirestoreStore, stripUndefined } from './store.js';

/**
 * Firestore-shaped tests for `FirestoreStore`.
 *
 * These exist because of a production incident: the first `bot:` account could not be
 * created at all, because `upsertUser` handed Firestore `email: undefined` and Firestore
 * rejects `undefined` rather than treating it as an absent field. Every existing test
 * ran against `InMemoryStore`, which happily stores whatever it is given — so the whole
 * suite was green while the real store could not write the document.
 *
 * The fake below is deliberately strict in exactly the one way that matters: it refuses
 * `undefined` values with the same error the real client raises. Anything that passes
 * here would have been writable for real.
 */

class UndefinedValueError extends Error {
  constructor(field: string) {
    super(
      `Value for argument "data" is not a valid Firestore document. Cannot use "undefined" as a Firestore value (found in field "${field}").`,
    );
  }
}

function rejectUndefined(data: Record<string, unknown>, path = ''): void {
  for (const [key, value] of Object.entries(data)) {
    const field = path ? `${path}.${key}` : key;
    if (value === undefined) throw new UndefinedValueError(field);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      rejectUndefined(value as Record<string, unknown>, field);
    }
  }
}

/**
 * Firestore also refuses an array whose elements are arrays — there is no "nested
 * array" value in its data model at all. That constraint is the reason a game save is
 * stored as an opaque JSON *string*: a game saving a 2D grid is completely ordinary,
 * and a parsed-object column would have rejected it at runtime, in production, for one
 * game, long after every in-memory test went green.
 */
class NestedArrayError extends Error {
  constructor(field: string) {
    super(`Cannot use "array" as an array value (found in field "${field}").`);
  }
}

function rejectNestedArrays(value: unknown, path = '', insideArray = false): void {
  if (Array.isArray(value)) {
    if (insideArray) throw new NestedArrayError(path);
    for (const entry of value) rejectNestedArrays(entry, path, true);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      rejectNestedArrays(entry, path ? `${path}.${key}` : key, false);
    }
  }
}

/** Minimal Firestore stand-in: enough surface for the user, waitlist and save writes. */
function fakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const key = (collection: string, id: string) => `${collection}/${id}`;

  /** Document ids directly under `path` — not those in deeper subcollections. */
  const idsUnder = (path: string) =>
    [...docs.keys()]
      .filter((stored) => stored.startsWith(`${path}/`) && !stored.slice(path.length + 1).includes('/'))
      .map((stored) => stored.slice(path.length + 1));

  const makeRef = (collection: string, id: string) => ({
    id,
    // `worlds/{id}/worldEntries` — the grandparent is what names a world, and the
    // erase path reads exactly that to report which worlds it touched.
    get parent() {
      return {
        get parent() {
          const segments = collection.split('/');
          return segments.length >= 3 ? { id: segments[segments.length - 2] } : null;
        },
      };
    },
    get: async () => ({
      get exists() {
        return docs.has(key(collection, id));
      },
      data: () => docs.get(key(collection, id)),
    }),
    set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
      rejectUndefined(data);
      rejectNestedArrays(data);
      const previous = options?.merge ? (docs.get(key(collection, id)) ?? {}) : {};
      docs.set(key(collection, id), { ...previous, ...data });
    },
    update: async (data: Record<string, unknown>) => {
      rejectUndefined(data);
      rejectNestedArrays(data);
      if (!docs.has(key(collection, id))) throw new Error('no document to update');
      docs.set(key(collection, id), { ...docs.get(key(collection, id))!, ...data });
    },
    delete: async () => {
      docs.delete(key(collection, id));
    },
    collection: (sub: string) => makeCollection(`${collection}/${id}/${sub}`),
  });

  /** Paths whose last segment is `group`, wherever they sit — a collection group. */
  const groupPaths = (group: string) =>
    [...new Set([...docs.keys()].map((stored) => stored.slice(0, stored.lastIndexOf('/'))))].filter((path) =>
      path.endsWith(`/${group}`),
    );

  const makeQuery = (paths: string[], filter: ((data: Record<string, unknown>) => boolean) | null, max?: number) => {
    const rows = () => {
      const found = paths.flatMap((path) =>
        idsUnder(path)
          .map((id) => ({ path, id, data: docs.get(key(path, id)) ?? {} }))
          .filter((row) => (filter ? filter(row.data) : true)),
      );
      return max === undefined ? found : found.slice(0, max);
    };
    const query = {
      where: (field: string, op: string, value: unknown) => {
        if (op !== '==') throw new Error(`fake supports == only, got ${op}`);
        return makeQuery(paths, (data) => (filter ? filter(data) : true) && data[field] === value, max);
      },
      limit: (n: number) => makeQuery(paths, filter, n),
      count: () => ({ get: async () => ({ data: () => ({ count: rows().length }) }) }),
      get: async () => {
        const found = rows();
        return {
          empty: found.length === 0,
          docs: found.map((row) => ({ id: row.id, data: () => row.data, ref: makeRef(row.path, row.id) })),
        };
      },
    };
    return query;
  };

  let autoIdCounter = 0;
  const makeCollection = (path: string) => ({
    doc: (id?: string) => makeRef(path, id ?? `auto-${(autoIdCounter += 1)}`),
    listDocuments: async () => idsUnder(path).map((id) => makeRef(path, id)),
    where: (field: string, op: string, value: unknown) => makeQuery([path], null).where(field, op, value),
    count: () => makeQuery([path], null).count(),
    get: async () => ({
      docs: idsUnder(path).map((id) => ({
        id,
        data: () => docs.get(key(path, id)) ?? {},
        ref: makeRef(path, id),
      })),
    }),
  });

  const db = {
    collection: (collection: string) => makeCollection(collection),
    collectionGroup: (group: string) => makeQuery(groupPaths(group), null),
    // Deletes are staged and applied on commit, like the real client — so a test that
    // forgets to commit sees nothing deleted rather than passing by accident.
    batch: () => {
      const staged: Array<() => void> = [];
      return {
        set: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          rejectUndefined(data);
          rejectNestedArrays(data);
          staged.push(() => void ref.set(data, options));
        },
        delete: (ref: { id: string; delete: () => Promise<void> }) => {
          staged.push(() => void ref.delete());
        },
        commit: async () => {
          for (const apply of staged) apply();
          staged.length = 0;
        },
      };
    },
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx = {
        // Aggregate queries are readable inside a transaction in the real client, and
        // the world write depends on that: its quota check has to be ordered against a
        // concurrent claim or two tabs can both spend the same last slot.
        get: (target: { get: () => Promise<unknown> }) => target.get(),
        set: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          rejectUndefined(data);
          rejectNestedArrays(data);
          void ref.set(data, options);
        },
        delete: (ref: ReturnType<typeof makeRef>) => void ref.delete(),
      };
      return fn(tx);
    },
  };

  return { db: db as unknown as Firestore, docs, key };
}

describe('stripUndefined', () => {
  it('drops undefined keys and keeps every other falsy value', () => {
    expect(stripUndefined({ a: undefined, b: null, c: 0, d: '', e: false, f: 'x' })).toEqual({
      b: null,
      c: 0,
      d: '',
      e: false,
      f: 'x',
    });
  });
});

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
