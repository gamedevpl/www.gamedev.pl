// Editors and CLIs we hand a BYOCA connect snippet to.
export const CONNECT_CLIENTS = ['claudeCode', 'codex', 'cursor', 'kimi', 'cli'] as const;
export type ConnectClient = (typeof CONNECT_CLIENTS)[number];

// One ready-to-paste connect snippet per supported client.
export type InstallSnippets = Record<ConnectClient, string>;
