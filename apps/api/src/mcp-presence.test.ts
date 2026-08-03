import { describe, expect, it } from 'vitest';
import {
  mcpPresenceText,
  MCP_PRESENCE_MIN_GAP_MS,
  shouldEmitMcpPresencePulse,
  shouldPulseMcpPresence,
} from './mcp-presence.js';

describe('mcp presence pulses', () => {
  it('pulses kit browse and brief reads, not openers or report_progress', () => {
    expect(shouldPulseMcpPresence('list_kit_files')).toBe(true);
    expect(shouldPulseMcpPresence('read_kit_file')).toBe(true);
    expect(shouldPulseMcpPresence('get_brief')).toBe(true);
    expect(shouldPulseMcpPresence('report_progress')).toBe(false);
    expect(shouldPulseMcpPresence('start')).toBe(false);
    expect(shouldPulseMcpPresence('continue_draft')).toBe(false);
    expect(shouldPulseMcpPresence('open_round')).toBe(false);
  });

  it('maps tools to short Studio-facing copy', () => {
    expect(mcpPresenceText('list_kit_files')).toMatch(/Creator Kit/i);
    expect(mcpPresenceText('get_gate_verdict')).toMatch(/checks/i);
    expect(mcpPresenceText('start')).toBeNull();
  });

  it('rate-limits pulses per job', () => {
    const t0 = 1_000_000;
    expect(shouldEmitMcpPresencePulse(undefined, t0)).toBe(true);
    expect(shouldEmitMcpPresencePulse(t0, t0 + MCP_PRESENCE_MIN_GAP_MS - 1)).toBe(false);
    expect(shouldEmitMcpPresencePulse(t0, t0 + MCP_PRESENCE_MIN_GAP_MS)).toBe(true);
  });
});
