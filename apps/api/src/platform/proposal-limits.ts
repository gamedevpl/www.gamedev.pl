// Proposal limits shared by the domain layer, routes and MCP.

// A proposal manifest carries jobId 0: proposals have no job.

// A real job id would read as a slug transfer.
export const PROPOSAL_NO_JOB = 0;

export const MAX_PROPOSAL_TITLE_LENGTH = 120;
export const MIN_PROPOSAL_DESCRIPTION_LENGTH = 20;
export const MAX_PROPOSAL_DESCRIPTION_LENGTH = 2000;
export const MAX_PROPOSAL_MESSAGE_LENGTH = 2000;

// Gate runs one proposal may start; the repair cycle had no bound.
export const MAX_PROPOSAL_SUBMITS = 10;

// Every submit starts a gate build.
export function canSubmitProposal(submitCount: number | undefined): boolean {
  return (submitCount ?? 0) < MAX_PROPOSAL_SUBMITS;
}
