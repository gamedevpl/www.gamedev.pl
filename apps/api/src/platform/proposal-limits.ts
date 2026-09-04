// Proposal limits shared by the domain layer, routes and MCP.

// A proposal manifest carries jobId 0: proposals have no job.

// A real job id would read as a slug transfer.
export const PROPOSAL_NO_JOB = 0;

export const MAX_PROPOSAL_TITLE_LENGTH = 120;
export const MIN_PROPOSAL_DESCRIPTION_LENGTH = 20;
export const MAX_PROPOSAL_DESCRIPTION_LENGTH = 2000;
export const MAX_PROPOSAL_MESSAGE_LENGTH = 2000;
