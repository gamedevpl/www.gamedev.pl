// Local tool calls never reach the MCP progress reminder.
export const BUILDER_PROGRESS =
  'Call `report_progress` every 60 seconds or 6 tool calls, whichever comes first (local calls count). ' +
  'Report at implementation, testing/capture and upload checkpoints; before blocking work and after it returns. ' +
  'Name a real change, next check or blocker in the creator’s language. ' +
  'Local work is invisible; `progress_stale` only arrives over MCP. ' +
  'After final submit, close with `end.summary`.';
