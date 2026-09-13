import type { Firestore } from '@google-cloud/firestore';
import { expect, it, vi } from 'vitest';
import { InMemoryStore } from '../../platform/store.js';
import { FirestoreSubmissionStore } from './submission.js';
import { permitsRecoveryClaim } from './recovery-admission.js';

function firestoreStore() {
  const docs = new Map<string, Record<string, unknown>>();
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        path: `${name}/${id}`,
        set: async (data: Record<string, unknown>) => {
          docs.set(`${name}/${id}`, data);
        },
      }),
      where: (_field: string, _op: string, slug: string) => ({ slug }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { path?: string; slug?: string }) =>
          ref.path
            ? { exists: docs.has(ref.path), data: () => docs.get(ref.path!) }
            : { docs: [...docs.values()].filter((row) => row.slug === ref.slug).map((row) => ({ data: () => row })) },
        set: (ref: { path: string }, data: Record<string, unknown>) =>
          docs.set(ref.path, { ...docs.get(ref.path), ...data }),
        update: (ref: { path: string }, data: Record<string, unknown>) =>
          docs.set(ref.path, { ...docs.get(ref.path), ...data }),
      }),
  };
  return new FirestoreSubmissionStore(db as unknown as Firestore);
}

it.each(['memory', 'firestore'])('%s admits only the nonce holder while recovery is in moderation', async (mode) => {
  const store = mode === 'memory' ? new InMemoryStore() : firestoreStore();
  await store.createSubmission(1, 'other', 'Sky');
  await store.createSubmission(2, 'owner', 'Sky');
  expect(await store.beginCheckoutRecovery('sky', 'lease', Date.now())).toBe(true);
  expect(await store.claimSubmissionSlug(1, 'sky', null)).toBe(false);
  await expect(store.setSubmissionSlug(1, 'sky')).rejects.toMatchObject({ statusCode: 409 });
  expect(
    await store.claimSubmissionSlug(2, 'sky', null, {
      key: 'key',
      spec: 'local',
      locale: 'en',
      admissionNonce: 'other',
    }),
  ).toBe(false);
  expect(
    await store.claimSubmissionSlug(2, 'sky', null, {
      key: 'key',
      spec: 'local',
      locale: 'en',
      admissionNonce: 'lease',
    }),
  ).toBe(true);
  await expect(store.setSubmissionSlug(2, 'sky')).resolves.toBeUndefined();
});

it.each(['memory', 'firestore'])(
  '%s permits ordinary claims after expiration but rejects the expired recovery writer',
  async (mode) => {
    const store = mode === 'memory' ? new InMemoryStore() : firestoreStore();
    await store.createSubmission(1, 'other', 'Sky');
    await store.createSubmission(2, 'owner', 'Sky');
    expect(await store.beginCheckoutRecovery('sky', 'expired', Date.now() - 16 * 60_000)).toBe(true);
    expect(
      await store.claimSubmissionSlug(2, 'sky', null, {
        key: 'key',
        spec: 'local',
        locale: 'en',
        admissionNonce: 'expired',
      }),
    ).toBe(false);
    expect(await store.claimSubmissionSlug(1, 'sky', null)).toBe(true);
  },
);

it('rejects a replaced nonce even when its original lifetime has not elapsed', () => {
  const time = vi.spyOn(Date, 'now').mockReturnValue(100);
  try {
    expect(permitsRecoveryClaim({ nonce: 'new', until: 200 }, 'old')).toBe(false);
    expect(permitsRecoveryClaim({ nonce: 'new', until: 200 }, 'new')).toBe(true);
    expect(permitsRecoveryClaim(undefined, 'old')).toBe(false);
  } finally {
    time.mockRestore();
  }
});
