import type { Firestore } from '@google-cloud/firestore';
import { expect, it, vi } from 'vitest';
import { InMemoryStore } from '../../platform/store.js';
import { FirestoreSubmissionStore } from './submission.js';
import { permitsRecoveryClaim } from './recovery-admission.js';

function firestoreStore(initial: Array<[string, Record<string, unknown>]> = []) {
  const docs = new Map<string, Record<string, unknown>>(initial);
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

it.each(['memory', 'firestore'])(
  '%s fences manual rounds during admission and admits the matching improvement',
  async (mode) => {
    const store = mode === 'memory' ? new InMemoryStore() : firestoreStore();
    await store.createSubmission(1, 'owner', 'Sky');
    await store.setSubmissionSlug(1, 'sky');
    await store.createSubmission(2, 'owner', 'Sky');
    expect(await store.beginCheckoutRecovery('sky', 'improvement', Date.now())).toBe(true);
    expect(await store.claimManualRoundSlug(2, 'sky', 1)).toBe(false);
    expect(await store.claimManualRoundSlug(2, 'sky', 1, 'different')).toBe(false);
    expect(await store.claimManualRoundSlug(2, 'sky', 1, 'improvement')).toBe(true);
  },
);

it.each(['memory', 'firestore'])(
  '%s refuses an expired improvement nonce but permits unleased manual work',
  async (mode) => {
    const store = mode === 'memory' ? new InMemoryStore() : firestoreStore();
    await store.createSubmission(1, 'owner', 'Sky');
    await store.setSubmissionSlug(1, 'sky');
    await store.createSubmission(2, 'owner', 'Sky');
    expect(await store.beginCheckoutRecovery('sky', 'expired', Date.now() - 16 * 60_000)).toBe(true);
    expect(await store.claimManualRoundSlug(2, 'sky', 1, 'expired')).toBe(false);
    expect(await store.claimManualRoundSlug(2, 'sky', 1)).toBe(true);
  },
);

it.each([
  { recoveryKey: 'old', ownerUid: 'owner', moderationBlockedAt: undefined, allowed: true },
  { recoveryKey: undefined, ownerUid: 'owner', moderationBlockedAt: undefined, allowed: false },
  // A recipient is a different uid; the route checked ownership.
  { recoveryKey: 'old', ownerUid: 'foreign', moderationBlockedAt: undefined, allowed: true },
  { recoveryKey: 'old', ownerUid: 'owner', moderationBlockedAt: 'blocked', allowed: false },
])(
  'Firestore reclaims abandoned recovery on lineage and moderation, not on the old uid: $allowed',
  async ({ allowed, ...source }) => {
    const store = firestoreStore([
      [
        'submissions/1',
        {
          jobId: 1,
          title: 'Sky',
          slug: 'sky',
          createdAt: '2026-01-01',
          state: 'abandoned',
          abandonedAt: '2026-01-02',
          ...source,
        },
      ],
    ]);
    await store.createSubmission(2, 'owner', 'Sky');
    expect(await store.claimSubmissionSlug(2, 'sky', 1, { key: 'fresh', spec: 'local', locale: 'en' })).toBe(allowed);
  },
);

it.each(['memory', 'firestore'])('%s allows a proposal binder only with its admission nonce', async (mode) => {
  const store = mode === 'memory' ? new InMemoryStore() : firestoreStore();
  await store.createSubmission(1, 'owner', 'Sky');
  await store.setSubmissionSlug(1, 'sky');
  await store.createSubmission(2, 'owner', 'Sky');
  expect(await store.beginCheckoutRecovery('sky', 'proposal', Date.now())).toBe(true);
  await expect(store.setSubmissionSlug(2, 'sky')).rejects.toMatchObject({ statusCode: 409 });
  await expect(store.setSubmissionSlug(2, 'sky', 'other')).rejects.toMatchObject({ statusCode: 409 });
  await expect(store.setSubmissionSlug(2, 'sky', 'proposal')).resolves.toBeUndefined();
});
