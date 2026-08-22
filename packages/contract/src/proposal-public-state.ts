// What a proposal looks like from outside the review desk.
export const PROPOSAL_PUBLIC_STATES = [
  'draft',
  'checking',
  'in_review',
  'needs_work',
  'changes_requested',
  'accepted',
  'merged',
  'declined',
  'withdrawn',
  'superseded',
  'expired',
] as const;

export type ProposalPublicState = (typeof PROPOSAL_PUBLIC_STATES)[number];
