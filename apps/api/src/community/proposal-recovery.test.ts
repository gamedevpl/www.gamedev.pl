import { expect, it, vi } from 'vitest';
import type { GamesStore } from '../delivery/games-store.js';
import { InMemoryStore, type ProposalRecord } from '../platform/store.js';
import { acceptProposal } from './proposals.js';
import type { ProposalAdopter } from './proposal-admission.js';

it.each(['admission', 'active'])('keeps proposal manifest retryable while recovery is %s', async (mode) => {
  const store = new InMemoryStore();
  const at = new Date().toISOString();
  await store.createSubmission(1, 'owner', 'Sky');
  await store.setSubmissionSlug(1, 'sky');
  if (mode === 'active') {
    await store.recordJobTransition(1, { to: 'canceled', at, by: 'operator' });
    await store.createSubmission(2, 'owner', 'Sky');
    expect(await store.claimSubmissionSlug(2, 'sky', 1, { key: 'recovered', spec: 'local', locale: 'en' })).toBe(true);
  } else expect(await store.beginCheckoutRecovery('sky', 'recovery', Date.now())).toBe(true);
  await store.setPublication({ slug: 'sky', state: 'published', currentVersion: 'base', publishedAt: at });
  const proposal: ProposalRecord = {
    id: 'proposal',
    targetSlug: 'sky',
    targetOwnerUid: 'owner',
    proposerUid: 'contributor',
    base: { kind: 'store', version: 'base' },
    version: 'candidate',
    state: 'in_review',
    stateSince: at,
    transitions: [],
    title: 'Brighter sky',
    description: 'Make the sky brighter',
    thread: [],
  };
  await store.putProposal(proposal);
  let modeOfManifest = 'proposal';
  const adoptManifest = vi.fn(async () => {
    expect(modeOfManifest).toBe('proposal');
    modeOfManifest = 'publish';
  });
  const adoptIntoJob = vi.fn<ProposalAdopter>(async ({ admissionNonce }) => {
    expect(admissionNonce).toEqual(expect.any(String));
    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, 'owner', 'Sky');
    await store.setSubmissionSlug(jobId, 'sky', admissionNonce);
    return { jobId };
  });
  const deps = { store, gamesStore: { adoptProposalVersion: adoptManifest } as unknown as GamesStore, adoptIntoJob };
  const decision = { id: 'proposal', byUid: 'owner', reviewer: 'creator' as const };
  expect(await acceptProposal(deps, decision)).toMatchObject({ ok: false, status: 409 });
  expect(adoptManifest).not.toHaveBeenCalled();
  expect(adoptIntoJob).not.toHaveBeenCalled();
  expect(modeOfManifest).toBe('proposal');
  expect((await store.getProposal('proposal'))?.state).toBe('in_review');
  if (mode === 'admission') await store.finishCheckoutRecovery('sky', 'recovery');
  else await store.recordJobTransition(2, { to: 'canceled', at, by: 'operator' });
  expect(await acceptProposal(deps, decision)).toMatchObject({ ok: true });
  expect(adoptManifest).toHaveBeenCalledOnce();
  expect(adoptIntoJob).toHaveBeenCalledOnce();
  expect(modeOfManifest).toBe('publish');
  expect((await store.getProposal('proposal'))?.state).toBe('accepted');
});
