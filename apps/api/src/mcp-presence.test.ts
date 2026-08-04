import { describe, expect, it } from 'vitest';
import {
  isMcpPresenceEventText,
  mcpPresenceKey,
  MCP_PRESENCE_MIN_GAP_MS,
  noteMcpPresencePulse,
  presencePreservesEnded,
  shouldEmitMcpPresencePulse,
  shouldPulseMcpPresence,
} from './mcp-presence.js';

describe('mcp presence pulses', () => {
  it('pulses kit browse and brief reads, not openers or report_progress', () => {
    expect(shouldPulseMcpPresence('list_kit_files')).toBe(true);
    expect(shouldPulseMcpPresence('read_kit_file')).toBe(true);
    expect(shouldPulseMcpPresence('read_kit_files')).toBe(true);
    expect(shouldPulseMcpPresence('get_brief')).toBe(true);
    expect(shouldPulseMcpPresence('list_staged_sources')).toBe(true);
    expect(shouldPulseMcpPresence('report_progress')).toBe(false);
    expect(shouldPulseMcpPresence('start')).toBe(false);
    expect(shouldPulseMcpPresence('continue_draft')).toBe(false);
    expect(shouldPulseMcpPresence('open_round')).toBe(false);
    expect(shouldPulseMcpPresence('stage_source_file')).toBe(false);
    expect(shouldPulseMcpPresence('patch_source_file')).toBe(false);
    expect(shouldPulseMcpPresence('clear_staged_sources')).toBe(false);
    // Inherited Object keys must not count as tools.
    expect(shouldPulseMcpPresence('toString')).toBe(false);
    expect(shouldPulseMcpPresence('constructor')).toBe(false);
  });

  it('maps tools to stable thought keys for Studio i18n', () => {
    expect(mcpPresenceKey('list_kit_files')).toBe('browsing_kit');
    expect(mcpPresenceKey('read_kit_files')).toBe('reading_kit');
    expect(mcpPresenceKey('get_brief')).toBe('reading_brief');
    expect(mcpPresenceKey('list_staged_sources')).toBe('checking_staged');
    expect(mcpPresenceKey('report_progress')).toBeNull();
  });

  it('preserves agentEndedAt for gate-poll presence only', () => {
    expect(presencePreservesEnded('get_gate_verdict')).toBe(true);
    expect(presencePreservesEnded('get_gate_media')).toBe(true);
    expect(presencePreservesEnded('list_kit_files')).toBe(false);
    expect(presencePreservesEnded('get_brief')).toBe(false);
  });

  it('recognizes leftover synthetic chat rows so status can hide them', () => {
    expect(isMcpPresenceEventText('Browsing the Creator Kit…')).toBe(true);
    expect(isMcpPresenceEventText('Reading Creator Kit files…')).toBe(true);
    expect(isMcpPresenceEventText('Checking staged sources…')).toBe(true);
    expect(isMcpPresenceEventText('Getting the squad moving.')).toBe(false);
  });

  it('rate-limits pulses per job', () => {
    const t0 = 1_000_000;
    expect(shouldEmitMcpPresencePulse(undefined, t0)).toBe(true);
    expect(shouldEmitMcpPresencePulse(t0, t0 + MCP_PRESENCE_MIN_GAP_MS - 1)).toBe(false);
    expect(shouldEmitMcpPresencePulse(t0, t0 + MCP_PRESENCE_MIN_GAP_MS)).toBe(true);
  });

  it('caps the per-job pulse map by dropping the oldest entries', () => {
    const pulses = new Map<number, number>();
    noteMcpPresencePulse(pulses, 1, 100, 2);
    noteMcpPresencePulse(pulses, 2, 200, 2);
    noteMcpPresencePulse(pulses, 3, 300, 2);
    expect([...pulses.keys()]).toEqual([2, 3]);
    noteMcpPresencePulse(pulses, 2, 400, 2);
    expect([...pulses.keys()]).toEqual([3, 2]);
  });
});
