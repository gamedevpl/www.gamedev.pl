// Which lane a Studio chat agent round belongs to.
export const CHAT_AGENT_SCOPES = ['draft', 'improve'] as const;
export type ChatAgentScope = (typeof CHAT_AGENT_SCOPES)[number];
