import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore, type SubmissionRecord } from './store.js';
import { resolveAuthorizedRoundBaseVersion } from './round-base-version.js';
import { bindSubmissionSlug } from '../store/slices/bind-submission-slug.js';

const slug = 'victim-game';
const victim: SubmissionRecord = {
  jobId: 1,
  ownerUid: 'victim',
  title: 'Victim',
  slug,
  state: 'published',
  createdAt: '2026-01-01T00:00:00.000Z',
  deliveredVersion: 'victim-draft',
  publishedAt: '2026-01-02T00:00:00.000Z',
};
const attacker: SubmissionRecord = {
  jobId: 2,
  ownerUid: 'attacker',
  title: 'Attacker',
  slug,
  state: 'building',
  createdAt: '2026-01-03T00:00:00.000Z',
};

function legacyStore(priors: SubmissionRecord[]) {
  const store = new InMemoryStore();
  vi.spyOn(store, 'getGameAccess').mockResolvedValue(null);
  vi.spyOn(store, 'listSubmissionsBySlug').mockResolvedValue([attacker, ...priors]);
  vi.spyOn(store, 'getPublishedSubmissionBySlug').mockResolvedValue(priors.find((prior) => prior.publishedAt) ?? null);
  vi.spyOn(store, 'getPublication').mockResolvedValue({
    slug,
    state: 'published',
    currentVersion: 'victim-live',
    publishedAt: victim.publishedAt!,
  });
  return store;
}

describe('source restore provenance', () => {
  it('does not inherit a different owner’s sibling or publication from a poisoned legacy slug', async () => {
    const store = legacyStore([victim]);
    expect(await resolveAuthorizedRoundBaseVersion(store, attacker, slug)).toBeNull();
  });

  it('does not trust a canonical owner record made by an orphan publication bind', async () => {
    const store = legacyStore([]);
    vi.mocked(store.getGameAccess).mockResolvedValue({
      slug,
      ownerUid: 'attacker',
      editorUids: [],
      accessRevision: 1,
      createdAt: attacker.createdAt,
      updatedAt: attacker.createdAt,
    });
    expect(await resolveAuthorizedRoundBaseVersion(store, attacker, slug)).toBeNull();
  });

  it('restores a genuine predecessor for its creator', async () => {
    const store = legacyStore([{ ...victim, ownerUid: 'attacker' }]);
    expect(await resolveAuthorizedRoundBaseVersion(store, attacker, slug)).toBe('victim-draft');
  });

  it('does not infer publication provenance from an owner with no matching delivery', async () => {
    const store = legacyStore([{ ...victim, ownerUid: 'attacker', deliveredVersion: undefined }]);
    expect(await resolveAuthorizedRoundBaseVersion(store, attacker, slug)).toBeNull();
  });

  it('rejects an owned published row whose delivery differs from the live version', async () => {
    const store = legacyStore([
      { ...victim, jobId: 3, ownerUid: 'attacker', state: 'canceled', deliveredVersion: 'older' },
      { ...victim, state: 'canceled', deliveredVersion: 'victim-live' },
    ]);
    expect(await resolveAuthorizedRoundBaseVersion(store, attacker, slug)).toBeNull();
  });

  it('restores a live publication only when its published row delivered that version', async () => {
    const store = legacyStore([
      { ...victim, ownerUid: 'attacker', state: 'canceled', deliveredVersion: 'victim-live' },
    ]);
    expect(await resolveAuthorizedRoundBaseVersion(store, attacker, slug)).toBe('victim-live');
  });

  it('lets the current canonical owner restore a predecessor after a transfer', async () => {
    const store = legacyStore([{ ...victim, deliveredVersion: 'victim-live' }]);
    vi.mocked(store.getGameAccess).mockResolvedValue({
      slug,
      ownerUid: 'attacker',
      editorUids: [],
      accessRevision: 2,
      createdAt: victim.createdAt,
      updatedAt: attacker.createdAt,
    });
    expect(await resolveAuthorizedRoundBaseVersion(store, attacker, slug)).toBe('victim-live');
  });

  it('keeps a job’s own candidate available', async () => {
    const store = legacyStore([victim]);
    expect(await resolveAuthorizedRoundBaseVersion(store, { ...attacker, previewVersion: 'own' }, slug)).toBe('own');
  });
});

it('rejects first binding to a publication with no earlier submission', async () => {
  const store = new InMemoryStore();
  await store.createSubmission(attacker.jobId, attacker.ownerUid, attacker.title);
  await store.setPublication({
    slug,
    state: 'published',
    currentVersion: 'victim-live',
    publishedAt: victim.publishedAt!,
  });
  await expect(store.setSubmissionSlug(attacker.jobId, slug, undefined, 1)).rejects.toMatchObject({ statusCode: 409 });
  expect((await store.getSubmission(attacker.jobId))?.slug).toBeUndefined();
});

it('rejects the same binding inside the Firestore claim transaction', async () => {
  const set = vi.fn();
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}` }),
      where: () => ({ query: true }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        get: async (ref: { query?: boolean; path?: string }) =>
          ref.query
            ? { docs: [] }
            : ref.path === `games/${slug}`
              ? { data: () => ({ publication: { currentVersion: 'victim-live' } }) }
              : { exists: true, data: () => attacker },
        set,
      }),
  };
  await expect(
    bindSubmissionSlug(db as unknown as Parameters<typeof bindSubmissionSlug>[0], attacker.jobId, slug, undefined, 1),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(set).not.toHaveBeenCalled();
});
