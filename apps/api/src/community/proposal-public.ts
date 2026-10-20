import type { ProposalRecord } from '../platform/store.js';
import { toPublicProposalState } from './proposal-state.js';

// Public proposal shape: no transitions, no gate report.
export function toPublicProposal(record: ProposalRecord) {
  return {
    id: record.id,
    targetSlug: record.targetSlug,
    proposerUid: record.proposerUid,
    state: toPublicProposalState(record.state),
    ...(record.kind ? { kind: record.kind } : {}),
    title: record.title,
    description: record.description,
    base: record.base,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    gate: record.gate
      ? { green: record.gate.green, ranAt: record.gate.ranAt, screenshot: record.gate.screenshot }
      : undefined,
    behaviouralDiff: record.behaviouralDiff,
    thread: record.thread,
    decision: record.decision
      ? { at: record.decision.at, reason: record.decision.reason, note: record.decision.note }
      : undefined,
    platformOwned: record.targetOwnerUid === null,
    acceptedVia: record.acceptedVia,
  };
}
