import { expect, it } from 'vitest';
import type { Firestore } from '@google-cloud/firestore';
import { FirestoreSubmissionStore } from './submission.js';

it('serializes initially empty slug queries through the shared game document', async () => {
  const docs = new Map<string, Record<string, unknown>>([
    ['submissions/1', { jobId: 1, ownerUid: 'a', createdAt: '2026-01-01' }],
    ['submissions/2', { jobId: 2, ownerUid: 'b', createdAt: '2026-01-01' }],
  ]);
  const versions = new Map<string, number>();
  let initialReads = 0;
  let release!: () => void;
  const bothRead = new Promise<void>((resolve) => {
    release = resolve;
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}` }),
      where: (_field: string, _op: string, slug: string) => ({ slug }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<boolean>) => {
      for (;;) {
        const reads = new Map<string, number>();
        const writes = new Map<string, Record<string, unknown>>();
        const tx = {
          get: async (ref: { path?: string; slug?: string }) => {
            if (!ref.path)
              return { docs: [...docs.values()].filter((d) => d.slug === ref.slug).map((d) => ({ data: () => d })) };
            reads.set(ref.path, versions.get(ref.path) ?? 0);
            const data = docs.get(ref.path);
            if (ref.path === 'games/sky' && initialReads < 2) {
              initialReads++;
              if (initialReads === 2) release();
              await bothRead;
            }
            return { exists: !!data, data: () => data };
          },
          set: (ref: { path: string }, data: Record<string, unknown>) => {
            writes.set(ref.path, data);
          },
          update: (ref: { path: string }, data: Record<string, unknown>) => {
            writes.set(ref.path, data);
          },
        };
        const result = await fn(tx);
        if ([...reads].some(([path, version]) => (versions.get(path) ?? 0) !== version)) continue;
        for (const [path, data] of writes) {
          docs.set(path, { ...docs.get(path), ...data });
          versions.set(path, (versions.get(path) ?? 0) + 1);
        }
        return result;
      }
    },
  };
  const store = new FirestoreSubmissionStore(db as unknown as Firestore);
  const results = await Promise.all([
    store.claimSubmissionSlug(1, 'sky', null),
    store.claimSubmissionSlug(2, 'sky', null),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect([...docs.values()].filter((d) => d.slug === 'sky')).toHaveLength(1);
});
