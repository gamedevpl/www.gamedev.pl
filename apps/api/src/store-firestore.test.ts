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

/** Minimal Firestore stand-in: enough surface for the user and waitlist writes. */
function fakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const key = (collection: string, id: string) => `${collection}/${id}`;

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
      const previous = options?.merge ? (docs.get(key(collection, id)) ?? {}) : {};
      docs.set(key(collection, id), { ...previous, ...data });
    },
  });

  const db = {
    collection: (collection: string) => ({ doc: (id: string) => makeRef(collection, id) }),
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

describe('the fake itself', () => {
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
