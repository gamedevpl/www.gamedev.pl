import { describe, expect, it } from 'vitest';
import {
  PROGRESS_STALE_CALLS,
  PROGRESS_STALE_MS,
  createMcpNudgeTracker,
  pendingCountFromPayload,
} from './mcp-session-nudges.js';

describe('mcp-session-nudges', () => {
  it('warns progress_stale after wall-clock silence', () => {
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    nudges.ensure(1, t0);
    nudges.noteProgress(1, t0);
    expect(nudges.warningsFor(1, 'read_kit_file', t0 + 10_000)).toEqual([]);
    const warnings = nudges.warningsFor(1, 'read_kit_file', t0 + PROGRESS_STALE_MS);
    expect(warnings.map((w) => w.code)).toContain('progress_stale');
  });

  it('warns progress_stale after enough tool calls without report_progress', () => {
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    nudges.ensure(1, t0);
    nudges.noteProgress(1, t0);
    for (let i = 0; i < PROGRESS_STALE_CALLS; i += 1) {
      nudges.noteToolSuccess(1, 'read_kit_file', t0 + i * 100);
    }
    expect(nudges.warningsFor(1, 'read_kit_file', t0 + 1_000).map((w) => w.code)).toContain('progress_stale');
  });

  it('does not progress-nudge exempt tools; report_progress clears the clock', () => {
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    nudges.ensure(1, t0);
    for (let i = 0; i < PROGRESS_STALE_CALLS + 2; i += 1) {
      nudges.noteToolSuccess(1, 'read_kit_file', t0 + i);
    }
    expect(nudges.warningsFor(1, 'get_gate_verdict', t0 + 50_000).map((w) => w.code)).not.toContain('progress_stale');
    nudges.noteToolSuccess(1, 'report_progress', t0 + 60_000);
    expect(nudges.warningsFor(1, 'read_kit_file', t0 + 61_000)).toEqual([]);
  });

  it('warns inbox_pending only while count > 0 (not on read_inbox itself)', () => {
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    nudges.notePendingCount(1, 2, t0);
    expect(nudges.peek(1)?.startedAt).toBe(t0);
    expect(nudges.warningsFor(1, 'read_kit_file', t0).map((w) => w.code)).toContain('inbox_pending');
    expect(nudges.warningsFor(1, 'read_inbox', t0).map((w) => w.code)).not.toContain('inbox_pending');
    nudges.noteInboxCheck(1, t0);
    nudges.notePendingCount(1, 0, t0);
    expect(nudges.warningsFor(1, 'read_kit_file', t0 + 1)).toEqual([]);
  });

  it('reads pending counts from common payload shapes', () => {
    expect(pendingCountFromPayload({ pendingMessages: [{ id: 'a' }] })).toBe(1);
    expect(pendingCountFromPayload({ pending: [] })).toBe(0);
    expect(pendingCountFromPayload({ messages: [{}, {}] })).toBe(2);
    expect(pendingCountFromPayload({ ok: true })).toBeNull();
  });

  it('warns seed_unread on kit browse until get_seed runs', () => {
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    nudges.noteSeedStatus(1, 'available', t0);
    expect(nudges.warningsFor(1, 'read_kit_files', t0).map((w) => w.code)).toContain('seed_unread');
    nudges.noteToolSuccess(1, 'get_seed', t0);
    expect(nudges.warningsFor(1, 'read_kit_files', t0 + 1).map((w) => w.code)).not.toContain('seed_unread');
  });
});
