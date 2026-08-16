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
    expect(isMcpPresenceEventText('Joining the build round…')).toBe(true);
    expect(isMcpPresenceEventText('Getting the squad moving.')).toBe(false);
  });

  it('only treats matching text as a leftover row when it predates the presence cutover', () => {
    // Pre-cutover match: a real leftover presence row — hide it.
    expect(isMcpPresenceEventText('Reading Creator Kit files…', '2026-08-06T12:00:00.000Z')).toBe(true);
    // Post-cutover match: a genuine report_progress reusing the phrasing — keep it.
    expect(isMcpPresenceEventText('Reading Creator Kit files…', '2026-08-10T12:00:00.000Z')).toBe(false);
    // Non-matching text is never a leftover row, any time.
    expect(isMcpPresenceEventText('Getting the squad moving.', '2026-08-06T12:00:00.000Z')).toBe(false);
    // Unparseable createdAt fails safe (treated as pre-cutover, i.e. filtered).
    expect(isMcpPresenceEventText('Reading Creator Kit files…', 'not-a-date')).toBe(true);
    // An hour before #661: still pre-cutover.
    expect(isMcpPresenceEventText('Reading Creator Kit files…', '2026-08-07T12:00:00.000Z')).toBe(true);
    // An hour after #661: already post-cutover.
    expect(isMcpPresenceEventText('Reading Creator Kit files…', '2026-08-07T14:00:00.000Z')).toBe(false);
  });

  it('rate-limits same-key pulses per job but allows a new thought key immediately', () => {
    const t0 = 1_000_000;
    expect(shouldEmitMcpPresencePulse(undefined, t0)).toBe(true);
    expect(shouldEmitMcpPresencePulse({ atMs: t0, key: 'browsing_kit' }, t0 + MCP_PRESENCE_MIN_GAP_MS - 1)).toBe(false);
    expect(
      shouldEmitMcpPresencePulse(
        { atMs: t0, key: 'browsing_kit' },
        t0 + MCP_PRESENCE_MIN_GAP_MS - 1,
        MCP_PRESENCE_MIN_GAP_MS,
        'browsing_kit',
      ),
    ).toBe(false);
    expect(
      shouldEmitMcpPresencePulse({ atMs: t0, key: 'joining_round' }, t0 + 1, MCP_PRESENCE_MIN_GAP_MS, 'reading_brief'),
    ).toBe(true);
    expect(shouldEmitMcpPresencePulse({ atMs: t0, key: 'browsing_kit' }, t0 + MCP_PRESENCE_MIN_GAP_MS)).toBe(true);
  });

  it('caps the per-job pulse map by dropping the oldest entries', () => {
    const pulses = new Map<number, { atMs: number; key: string }>();
    noteMcpPresencePulse(pulses, 1, 100, 'a', 2);
    noteMcpPresencePulse(pulses, 2, 200, 'b', 2);
    noteMcpPresencePulse(pulses, 3, 300, 'c', 2);
    expect([...pulses.keys()]).toEqual([2, 3]);
    noteMcpPresencePulse(pulses, 2, 400, 'b', 2);
    expect([...pulses.keys()]).toEqual([3, 2]);
  });
});
