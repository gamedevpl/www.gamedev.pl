// Every managed vendor the platform knows how to build a backend for.
export const MANAGED_AGENT_VENDORS = ['anthropic', 'gemini', 'copilot', 'openai'] as const;
export type ManagedAgentVendorName = (typeof MANAGED_AGENT_VENDORS)[number];
