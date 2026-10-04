import {
  expireStaleProposals,
  markProposalsMerged,
  reconcileProposalGate,
  supersedeStaleProposals,
  type ProposalDeps,
} from './proposals.js';

// Proposals still waiting on a gate verdict, checked per sweep.
export const MAX_PENDING_RECONCILES = 200;

// A gate verdict landed; advance the proposal it belongs to, if any.
export async function reconcileDeliveredProposal(
  deps: ProposalDeps,
  verdict: { slug: string; version: string; kind: string },
): Promise<void> {
  if (verdict.kind !== 'gate') return;
  const manifest = await deps.gamesStore.getManifest(verdict.slug, verdict.version);
  if (manifest?.deliveryMode !== 'proposal' || !manifest.proposal?.id) return;
  await reconcileProposalGate(deps, manifest.proposal.id);
}

// A version went live: merge the proposal it carried, supersede the rest.
export async function settleProposalsOnPublish(
  deps: ProposalDeps,
  input: { slug: string; version: string },
): Promise<{ merged: number; superseded: number }> {
  const merged = await markProposalsMerged(deps, input);
  const superseded = await supersedeStaleProposals(deps, { slug: input.slug, currentVersion: input.version });
  return { merged: merged.length, superseded };
}

// Periodic pass: catch verdicts the push missed, then expire silent reviews.
export async function sweepProposals(deps: ProposalDeps): Promise<{ reconciled: number; expired: number }> {
  const pending = await deps.store.listProposals({ state: ['submitted', 'gating'], limit: MAX_PENDING_RECONCILES });
  let reconciled = 0;
  for (const record of pending) {
    const after = await reconcileProposalGate(deps, record.id);
    if (after && after.state !== record.state) reconciled += 1;
  }
  const expired = await expireStaleProposals(deps);
  return { reconciled, expired: expired.length };
}

export interface ProposalLifecycle {
  onVerdict: (verdict: { slug: string; version: string; kind: string }) => Promise<void>;
  onPublished: (input: { slug: string; version: string }) => Promise<void>;
  sweep: () => Promise<{ reconciled: number; expired: number } | undefined>;
}

// Composition-root hooks; each logs and swallows so its caller never fails.
export function createProposalLifecycle(deps: ProposalDeps | null): ProposalLifecycle {
  const fail = (message: string) => (err: unknown) => {
    deps?.log?.error({ err }, message);
    return undefined;
  };
  return {
    onVerdict: async (verdict) => {
      if (deps) await reconcileDeliveredProposal(deps, verdict).catch(fail('proposal gate reconcile failed'));
    },
    onPublished: async (input) => {
      if (deps) await settleProposalsOnPublish(deps, input).catch(fail('proposal settle after publish failed'));
    },
    sweep: async () => (deps ? sweepProposals(deps).catch(fail('proposal sweep failed')) : undefined),
  };
}
