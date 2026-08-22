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

// Range-filtered fields here are ISO timestamps, so plain `<` already sorts correctly.
function lessThan(a: unknown, b: unknown): boolean {
  return (a as string | number) < (b as string | number);
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

  // Splits validate from apply so batch.commit() below can be atomic.
  const stageFor = (collection: string, id: string) => {
    const docKey = key(collection, id);
    return {
      set: (data: Record<string, unknown>, options?: { merge?: boolean }) => ({
        validate: () => {
          rejectUndefined(data);
          rejectNestedArrays(data);
        },
        apply: () => {
          const previous = options?.merge ? (docs.get(docKey) ?? {}) : {};
          docs.set(docKey, { ...previous, ...data });
        },
      }),
      // Unlike set, the real client refuses a create over an existing document --
      // several record kinds (OAuth clients/tokens/codes, access tokens) rely on that
      // to catch an id collision rather than silently overwriting another owner's row.
      create: (data: Record<string, unknown>) => ({
        validate: () => {
          rejectUndefined(data);
          rejectNestedArrays(data);
          if (docs.has(docKey)) throw new Error(`ALREADY_EXISTS: document ${docKey} already exists`);
        },
        apply: () => docs.set(docKey, { ...data }),
      }),
      update: (data: Record<string, unknown>) => ({
        validate: () => {
          rejectUndefined(data);
          rejectNestedArrays(data);
          if (!docs.has(docKey)) throw new Error('no document to update');
        },
        apply: () => docs.set(docKey, { ...docs.get(docKey)!, ...data }),
      }),
      delete: () => ({ validate: () => {}, apply: () => docs.delete(docKey) }),
    };
  };

  const makeRef = (collection: string, id: string) => {
    const stage = stageFor(collection, id);
    // Immediate write: validate then apply, same as inside a batch/transaction.
    const now = (op: { validate: () => void; apply: () => void }) => {
      op.validate();
      op.apply();
    };
    return {
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
      set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => now(stage.set(data, options)),
      create: async (data: Record<string, unknown>) => now(stage.create(data)),
      update: async (data: Record<string, unknown>) => now(stage.update(data)),
      delete: async () => now(stage.delete()),
      collection: (sub: string) => makeCollection(`${collection}/${id}/${sub}`),
      // Internal: batch/transaction staging hook, not real Firestore's API.
      _stage: stage,
    };
  };

  /** Paths whose last segment is `group`, wherever they sit — a collection group. */
  const groupPaths = (group: string) =>
    [...new Set([...docs.keys()].map((stored) => stored.slice(0, stored.lastIndexOf('/'))))].filter((path) =>
      path.endsWith(`/${group}`),
    );

  type QueryOpts = {
    max?: number;
    order?: { field: string; direction: 'asc' | 'desc' };
    select?: string[];
    afterId?: string;
  };

  // No orderBy -> stable Map insertion order (real Firestore uses __name__).
  const makeQuery = (
    paths: string[],
    filter: ((data: Record<string, unknown>) => boolean) | null,
    opts: QueryOpts = {},
  ) => {
    const rows = () => {
      let found = paths.flatMap((path) =>
        idsUnder(path)
          .map((id) => ({ path, id, data: docs.get(key(path, id)) ?? {} }))
          .filter((row) => (filter ? filter(row.data) : true)),
      );
      if (opts.order) {
        const { field, direction } = opts.order;
        const sign = direction === 'desc' ? -1 : 1;
        found = [...found].sort((a, b) => {
          const av = a.data[field];
          const bv = b.data[field];
          if (av === bv) return 0;
          return (av! < bv! ? -1 : 1) * sign;
        });
      }
      if (opts.afterId !== undefined) {
        const cursorIndex = found.findIndex((row) => row.id === opts.afterId);
        found = cursorIndex === -1 ? [] : found.slice(cursorIndex + 1);
      }
      return opts.max === undefined ? found : found.slice(0, opts.max);
    };
    const project = (data: Record<string, unknown>) =>
      opts.select ? Object.fromEntries(opts.select.map((field) => [field, data[field]])) : data;
    const query = {
      where: (field: string, op: string, value: unknown) => {
        const test =
          op === '=='
            ? (data: Record<string, unknown>) => data[field] === value
            : op === '!='
              ? (data: Record<string, unknown>) => data[field] !== value
              : op === '<'
                ? (data: Record<string, unknown>) => lessThan(data[field], value)
                : op === '<='
                  ? (data: Record<string, unknown>) => !lessThan(value, data[field])
                  : op === '>'
                    ? (data: Record<string, unknown>) => lessThan(value, data[field])
                    : op === '>='
                      ? (data: Record<string, unknown>) => !lessThan(data[field], value)
                      : op === 'in'
                        ? (data: Record<string, unknown>) => Array.isArray(value) && value.includes(data[field])
                        : null;
        if (!test) throw new Error(`fake doesn't support the "${op}" operator`);
        return makeQuery(paths, (data) => (filter ? filter(data) : true) && test(data), opts);
      },
      orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') =>
        makeQuery(paths, filter, { ...opts, order: { field, direction } }),
      select: (...fields: string[]) => makeQuery(paths, filter, { ...opts, select: fields }),
      // Matched by id -- unique within any single flat collection queried here.
      startAfter: (cursor: { id: string }) => makeQuery(paths, filter, { ...opts, afterId: cursor.id }),
      limit: (n: number) => makeQuery(paths, filter, { ...opts, max: n }),
      count: () => ({ get: async () => ({ data: () => ({ count: rows().length }) }) }),
      get: async () => {
        const found = rows();
        return {
          empty: found.length === 0,
          docs: found.map((row) => ({ id: row.id, data: () => project(row.data), ref: makeRef(row.path, row.id) })),
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
    orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') => makeQuery([path], null).orderBy(field, direction),
    select: (...fields: string[]) => makeQuery([path], null).select(...fields),
    startAfter: (cursor: { id: string }) => makeQuery([path], null).startAfter(cursor),
    limit: (n: number) => makeQuery([path], null).limit(n),
    count: () => makeQuery([path], null).count(),
    get: async () => makeQuery([path], null).get(),
  });

  const db = {
    collection: (collection: string) => makeCollection(collection),
    collectionGroup: (group: string) => makeQuery(groupPaths(group), null),
    // Deletes are staged and applied on commit, like the real client — so a test that
    // forgets to commit sees nothing deleted rather than passing by accident.

    // commit() validates every staged write before applying any -- atomic, like real Firestore.
    batch: () => {
      const staged: Array<{ validate: () => void; apply: () => void }> = [];
      return {
        set: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>, options?: { merge?: boolean }) =>
          staged.push(ref._stage.set(data, options)),
        create: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>) =>
          staged.push(ref._stage.create(data)),
        update: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>) =>
          staged.push(ref._stage.update(data)),
        delete: (ref: ReturnType<typeof makeRef>) => staged.push(ref._stage.delete()),
        commit: async () => {
          for (const op of staged) op.validate();
          for (const op of staged) op.apply();
          staged.length = 0;
        },
      };
    },
    // Writes apply as each tx.* call runs; a failed one now rejects.
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx = {
        // Aggregate queries are readable inside a transaction in the real client, and
        // the world write depends on that: its quota check has to be ordered against a
        // concurrent claim or two tabs can both spend the same last slot.
        get: (target: { get: () => Promise<unknown> }) => target.get(),
        set: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          const op = ref._stage.set(data, options);
          op.validate();
          op.apply();
        },
        create: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>) => {
          const op = ref._stage.create(data);
          op.validate();
          op.apply();
        },
        update: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>) => {
          const op = ref._stage.update(data);
          op.validate();
          op.apply();
        },
        delete: (ref: ReturnType<typeof makeRef>) => {
          const op = ref._stage.delete();
          op.apply();
        },
      };
      return fn(tx);
    },
  };

  return { db: db as unknown as Firestore, docs, key };
}
