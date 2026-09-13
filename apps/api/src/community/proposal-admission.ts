import { randomUUID } from 'node:crypto';
import type { Store, ProposalRecord } from '../platform/store.js';
import { isActiveBuildRound } from '../creation/job-state.js';
import type { DecisionResult } from './proposals.js';

export async function withProposalAdmission(
  store: Store,
  slug: string,
  action: (nonce: string) => Promise<DecisionResult>,
): Promise<DecisionResult> {
  const nonce = randomUUID();
  if (!(await store.beginCheckoutRecovery(slug, nonce, Date.now())))
    return { ok: false, status: 409, error: 'round_in_progress' };
  try {
    const holder = await store.getSubmissionBySlug(slug);
    if (holder?.recoveryKey && isActiveBuildRound(holder))
      return { ok: false, status: 409, error: 'round_in_progress' };
    return await action(nonce);
  } finally {
    // Failed cleanup expires with the lease; preserve the completed decision.
    await store.finishCheckoutRecovery(slug, nonce).catch(() => {});
  }
}

export type ProposalAdopter = (input: {
  proposal: ProposalRecord;
  ownerUid: string | null;
  admissionNonce?: string;
}) => Promise<{ jobId: number } | null>;
