// Studio chat agent metrics: structured logs, no message or reply text.

import type { ChatAgentScope } from '@gamedevpl/contract';

export const CHAT_AGENT_DECISION_MSG = 'studio chat agent decision';
export const CHAT_AGENT_FAILOPEN_MSG = 'studio chat agent failed open';

export type ChatAgentScopeLabel = ChatAgentScope;
export type ChatAgentOutcome = 'build' | 'reply';

interface Logger {
  info: (context: object, message: string) => void;
  warn: (context: object, message: string) => void;
}

export function asChatAgentLogger(log: {
  info?: (context: object, message: string) => void;
  warn?: (context: object, message: string) => void;
}): Logger | null {
  if (typeof log.info !== 'function' || typeof log.warn !== 'function') return null;
  return { info: log.info.bind(log), warn: log.warn.bind(log) };
}

export function logChatAgentDecision(
  log: Logger,
  input: {
    issueNumber: number;
    scope: ChatAgentScopeLabel;
    outcome: ChatAgentOutcome;
  },
): void {
  log.info(
    { chatAgent: { issueNumber: input.issueNumber, scope: input.scope, outcome: input.outcome } },
    CHAT_AGENT_DECISION_MSG,
  );
}

export function logChatAgentFailOpen(
  log: Logger,
  input: { issueNumber: number; scope: ChatAgentScopeLabel; reason: string },
): void {
  log.warn(
    { chatAgent: { issueNumber: input.issueNumber, scope: input.scope, reason: input.reason } },
    CHAT_AGENT_FAILOPEN_MSG,
  );
}
