import { describe, expect, it } from 'vitest';
import { AGENT_CHANNEL_ROUTES } from './agent-channel-routes.js';

describe('AGENT_CHANNEL_ROUTES', () => {
  it('every path starts with the channel prefix', () => {
    for (const path of Object.values(AGENT_CHANNEL_ROUTES)) {
      expect(path.startsWith('/api/agent/build')).toBe(true);
    }
  });

  it('every path is unique', () => {
    const paths = Object.values(AGENT_CHANNEL_ROUTES);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('keys are unique (guards the generator this table was written from)', () => {
    const keys = Object.keys(AGENT_CHANNEL_ROUTES);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
