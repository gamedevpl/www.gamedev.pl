// What a managed builder session is offered beyond the public MCP.

// Unlisted for managed builders; no tool they see names them.
export const MCP_HIDDEN_FROM_MANAGED: ReadonlySet<string> = new Set([
  'get_game_performance',
  'suggest_next_round',
  'share_draft',
  'list_account_games',
  'propose_game_transfer',
  'get_game_transfer_proposal_receipt',
  'get_game_access',
  'concept_frame_upload_url',
]);

// The prompt forbids the web, so its tools would only cost context.
export const WEB_TOOLS_OFF = [
  { name: 'web_fetch', enabled: false },
  { name: 'web_search', enabled: false },
];
