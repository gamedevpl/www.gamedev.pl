import { describe, expect, it, vi } from 'vitest';
import {
  asChatAgentLogger,
  CHAT_AGENT_DECISION_MSG,
  CHAT_AGENT_FAILOPEN_MSG,
  logChatAgentDecision,
  logChatAgentFailOpen,
} from './chat-agent-metrics.js';

describe('chat agent metrics', () => {
  it('emits stable decision / fail-open messages, never the message text', () => {
    const info = vi.fn();
    const warn = vi.fn();
    const log = { info, warn };

    logChatAgentDecision(log, { jobId: 42, scope: 'draft', outcome: 'reply' });
    logChatAgentFailOpen(log, { jobId: 42, scope: 'draft', reason: 'timeout' });

    expect(info).toHaveBeenCalledWith(
      { chatAgent: { jobId: 42, scope: 'draft', outcome: 'reply' } },
      CHAT_AGENT_DECISION_MSG,
    );
    expect(warn).toHaveBeenCalledWith(
      { chatAgent: { jobId: 42, scope: 'draft', reason: 'timeout' } },
      CHAT_AGENT_FAILOPEN_MSG,
    );

    // Closed-shape payloads only — never the message or reply text.
    const allCalls = [...info.mock.calls, ...warn.mock.calls];
    for (const [payload] of allCalls) {
      expect(Object.keys(payload.chatAgent).every((key) => ['jobId', 'scope', 'outcome', 'reason'].includes(key))).toBe(
        true,
      );
    }
  });
});

describe('asChatAgentLogger', () => {
  it('binds when both info and warn are present', () => {
    const info = vi.fn();
    const warn = vi.fn();
    const bound = asChatAgentLogger({ info, warn });
    expect(bound).not.toBeNull();
    bound!.info({}, 'x');
    expect(info).toHaveBeenCalled();
  });

  it('is null when either method is missing', () => {
    expect(asChatAgentLogger({ info: vi.fn() })).toBeNull();
    expect(asChatAgentLogger({ warn: vi.fn() })).toBeNull();
    expect(asChatAgentLogger({})).toBeNull();
  });
});
