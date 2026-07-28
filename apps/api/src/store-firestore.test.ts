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
    delete: async () => {
      docs.delete(key(collection, id));
    },
    collection: (sub: string) => makeCollection(`${collection}/${id}/${sub}`),
  });

  const makeCollection = (path: string) => ({
    doc: (id: string) => makeRef(path, id),
    listDocuments: async () => idsUnder(path).map((id) => makeRef(path, id)),
    get: async () => ({
      docs: idsUnder(path).map((id) => ({ id, data: () => docs.get(key(path, id)) ?? {} })),
    }),
  });

  const db = {
    collection: (collection: string) => makeCollection(collection),
    // Deletes are staged and applied on commit, like the real client — so a test that
    // forgets to commit sees nothing deleted rather than passing by accident.
    batch: () => {
      const staged: Array<() => void> = [];
      return {
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
        get: (ref: ReturnType<typeof makeRef>) => ref.get(),
        set: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          rejectUndefined(data);
          const previous = options?.merge ? (docs.get(key('users', ref.id)) ?? {}) : {};
          docs.set(key('users', ref.id), { ...previous, ...data });
        },
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
