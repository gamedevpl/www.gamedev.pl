import { describe, expect, it } from 'vitest';
import { chooseBuilder, costCopy } from './choice.js';

describe('ask-per-task builder choice', () => {
  it('does not remember a default; flags skip the ask', () => {
    expect(chooseBuilder({ hasLocal: true, flags: { platform: true } })).toBe('platform');
    expect(chooseBuilder({ hasLocal: true, flags: { agent: 'claude' } })).toBe('local');
    expect(chooseBuilder({ hasLocal: false, flags: {} })).toBe('platform');
    expect(chooseBuilder({ hasLocal: true, flags: {}, ask: () => 'local' })).toBe('local');
    expect(costCopy('platform')).toContain('quota');
    expect(costCopy('local', 'claude')).toContain('claude');
  });
});
