import { describe, expect, it } from 'vitest';
import { CHAT_AGENT_SCOPES } from './chat-agent-scope.js';

describe('CHAT_AGENT_SCOPES', () => {
  it('lists the two chat agent lanes', () => {
    expect(CHAT_AGENT_SCOPES).toEqual(['draft', 'improve']);
  });
});
