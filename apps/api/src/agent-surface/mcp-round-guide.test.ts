import { describe, expect, it } from 'vitest';
import { MCP_INSTRUCTIONS, nextSuggestedTool, ROUND_SEQUENCE } from './mcp-round-guide.js';

describe('mcp-round-guide', () => {
  it('points at the tool the most pressing warning is waiting on', () => {
    expect(nextSuggestedTool([])).toBeUndefined();
    expect(nextSuggestedTool([{ code: 'progress_stale' }])).toBe('report_progress');
    expect(nextSuggestedTool([{ code: 'call_end' }, { code: 'progress_stale' }])).toBe('end');
    // A refused gate outranks closing the session.
    expect(nextSuggestedTool([{ code: 'call_end' }, { code: 'must_fix_gate' }])).toBe('submit_sources');
    expect(nextSuggestedTool([{ code: 'inbox_pending' }, { code: 'call_end' }])).toBe('read_inbox');
    expect(nextSuggestedTool([{ code: 'gate_poll_backoff' }])).toBeUndefined();
  });

  it('keeps the instructions short and every step a statement', () => {
    expect(MCP_INSTRUCTIONS.length).toBeLessThan(3000);
    for (const step of ROUND_SEQUENCE) {
      expect(step).not.toMatch(/\b(ALWAYS|NEVER|MUST|STOP|END)\b/);
      expect(step).not.toMatch(/^(call|use|do|don't|never|always)\b/i);
    }
  });
});
