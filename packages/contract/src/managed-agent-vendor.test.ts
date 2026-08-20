import { describe, expect, it } from 'vitest';
import { MANAGED_AGENT_VENDORS } from './managed-agent-vendor.js';

describe('MANAGED_AGENT_VENDORS', () => {
  it('lists the four vendors the API and web both derive', () => {
    expect(MANAGED_AGENT_VENDORS).toEqual(['anthropic', 'gemini', 'copilot', 'openai']);
  });
});
