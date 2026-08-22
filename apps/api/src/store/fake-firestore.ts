import type { Firestore } from '@google-cloud/firestore';

/**
 * Firestore-shaped test double, shared by `store-firestore.test.ts` and the store
 * parity harness (`store/store-parity.test.ts`).
 *
 * Exists because of a production incident: the first `bot:` account could not be
 * created at all, because `upsertUser` handed Firestore `email: undefined` and
 * Firestore rejects `undefined` rather than treating it as an absent field. Every
 * existing test ran against `InMemoryStore`, which happily stores whatever it is
 * given — so the whole suite was green while the real store could not write the
 * document. This fake is deliberately strict in exactly the ways that matter:
 * anything that passes here would have been writable for real.
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

/** Minimal Firestore stand-in: documents, collection groups, batches, transactions. */
export function fakeFirestore() {
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
    // Unlike set, the real client refuses a create over an existing document --
    // several record kinds (OAuth clients/tokens/codes, access tokens) rely on that
    // to catch an id collision rather than silently overwriting another owner's row.
    create: async (data: Record<string, unknown>) => {
      rejectUndefined(data);
      rejectNestedArrays(data);
      if (docs.has(key(collection, id))) {
        throw new Error(`ALREADY_EXISTS: document ${key(collection, id)} already exists`);
      }
      docs.set(key(collection, id), { ...data });
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
        const test =
          op === '=='
            ? (data: Record<string, unknown>) => data[field] === value
            : op === '!='
              ? (data: Record<string, unknown>) => data[field] !== value
              : null;
        if (!test) throw new Error(`fake supports == and != only, got ${op}`);
        return makeQuery(paths, (data) => (filter ? filter(data) : true) && test(data), max);
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
    limit: (n: number) => makeQuery([path], null).limit(n),
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
        create: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>) => {
          rejectUndefined(data);
          rejectNestedArrays(data);
          staged.push(() => void ref.create(data));
        },
        update: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>) => {
          rejectUndefined(data);
          rejectNestedArrays(data);
          staged.push(() => void ref.update(data));
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
        create: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>) => {
          rejectUndefined(data);
          rejectNestedArrays(data);
          void ref.create(data);
        },
        update: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>) => {
          rejectUndefined(data);
          rejectNestedArrays(data);
          void ref.update(data);
        },
        delete: (ref: ReturnType<typeof makeRef>) => void ref.delete(),
      };
      return fn(tx);
    },
  };

  return { db: db as unknown as Firestore, docs, key };
}
