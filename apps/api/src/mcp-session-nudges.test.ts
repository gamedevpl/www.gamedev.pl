import { describe, expect, it } from 'vitest';
import {
  GATE_POLL_MIN_INTERVAL_MS,
  PROGRESS_STALE_CALLS,
  PROGRESS_STALE_MS,
  TRANSCRIPT_REMINDER_LIMIT,
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

  it('re-emits call_end after submit until end', () => {
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    nudges.noteSubmitSuccess(1, t0);
    expect(nudges.warningsFor(1, 'submit_sources', t0).map((w) => w.code)).not.toContain('call_end');
    const onGate = nudges.warningsFor(1, 'get_gate_verdict', t0);
    expect(onGate.map((w) => w.code)).toContain('call_end');
    expect(onGate.find((w) => w.code === 'call_end')?.message).toMatch(/one-shot check.*stop:true/i);
    nudges.noteToolSuccess(1, 'end', t0 + 1);
    expect(
      nudges.warningsFor(1, 'get_gate_verdict', t0 + GATE_POLL_MIN_INTERVAL_MS + 2).map((w) => w.code),
    ).not.toContain('call_end');
  });

  it('keeps call_end armed after noteToolSuccess on progress (end is what clears it)', () => {
    // applySessionNudges must not clear awaitingEnd on report_progress / stage —
    // only must_fix_gate on the reply suppresses call_end (review, #627).
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    nudges.noteSubmitSuccess(1, t0);
    nudges.noteToolSuccess(1, 'report_progress', t0 + 1);
    nudges.noteToolSuccess(1, 'stage_source_file', t0 + 2);
    expect(nudges.warningsFor(1, 'get_brief', t0 + 3).map((w) => w.code)).toContain('call_end');
    nudges.noteEnded(1, t0 + 4);
    expect(nudges.warningsFor(1, 'get_brief', t0 + 5).map((w) => w.code)).not.toContain('call_end');
  });

  it('soft-warns gate_poll_backoff on tight get_gate_verdict loops', () => {
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    expect(nudges.warningsFor(1, 'get_gate_verdict', t0).map((w) => w.code)).not.toContain('gate_poll_backoff');
    const repeated = nudges.warningsFor(1, 'get_gate_verdict', t0 + 1_000);
    expect(repeated.map((w) => w.code)).toContain('gate_poll_backoff');
    const message = repeated.find((w) => w.code === 'gate_poll_backoff')?.message ?? '';
    expect(message).toMatch(/deliveryId is null.*submit_sources/i);
    expect(message).toContain('retryAfterSeconds=30');
    expect(message).not.toMatch(/~\d+s/);
    expect(
      nudges.warningsFor(1, 'get_gate_verdict', t0 + 1_000 + GATE_POLL_MIN_INTERVAL_MS).map((w) => w.code),
    ).not.toContain('gate_poll_backoff');
  });

  it('warns transcript_unread once dispatchAttempt > 1, until get_transcript runs', () => {
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    nudges.noteDispatchAttempt(1, 2, t0);
    expect(nudges.warningsFor(1, 'get_brief', t0).map((w) => w.code)).toContain('transcript_unread');
    // start and get_transcript itself never carry the nudge.
    expect(nudges.warningsFor(1, 'start', t0).map((w) => w.code)).not.toContain('transcript_unread');
    expect(nudges.warningsFor(1, 'get_transcript', t0).map((w) => w.code)).not.toContain('transcript_unread');
    nudges.noteToolSuccess(1, 'get_transcript', t0 + 1);
    expect(nudges.warningsFor(1, 'get_brief', t0 + 2).map((w) => w.code)).not.toContain('transcript_unread');
  });

  it('never warns transcript_unread on the first-ever dispatch, or before one has been reported', () => {
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    expect(nudges.warningsFor(1, 'get_brief', t0).map((w) => w.code)).not.toContain('transcript_unread');
    nudges.noteDispatchAttempt(1, 1, t0);
    expect(nudges.warningsFor(1, 'get_brief', t0 + 1).map((w) => w.code)).not.toContain('transcript_unread');
  });

  it('caps transcript_unread reminders so a long round is not nagged forever', () => {
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    nudges.noteDispatchAttempt(1, 2, t0);
    for (let i = 0; i < TRANSCRIPT_REMINDER_LIMIT; i += 1) {
      expect(nudges.warningsFor(1, 'stage_source_file', t0 + i).map((w) => w.code)).toContain('transcript_unread');
    }
    expect(nudges.warningsFor(1, 'stage_source_file', t0 + 100).map((w) => w.code)).not.toContain('transcript_unread');
  });

  it('re-arms transcript_unread when a new dispatch attempt starts, even on the same in-process tracker', () => {
    // A tracker keyed by jobId outlives one dispatch across attempts.
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    nudges.noteDispatchAttempt(1, 2, t0);
    nudges.noteToolSuccess(1, 'get_transcript', t0 + 1);
    expect(nudges.warningsFor(1, 'get_brief', t0 + 2).map((w) => w.code)).not.toContain('transcript_unread');

    // Attempt 3 starts on the same job.
    nudges.noteDispatchAttempt(1, 3, t0 + 100);
    expect(nudges.warningsFor(1, 'get_brief', t0 + 101).map((w) => w.code)).toContain('transcript_unread');
  });

  it('does not re-arm transcript_unread when the same dispatch attempt is reported again', () => {
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    nudges.noteDispatchAttempt(1, 2, t0);
    nudges.noteToolSuccess(1, 'get_transcript', t0 + 1);
    // Same attempt reported again must not re-arm the reminder.
    nudges.noteDispatchAttempt(1, 2, t0 + 2);
    expect(nudges.warningsFor(1, 'get_brief', t0 + 3).map((w) => w.code)).not.toContain('transcript_unread');
  });

  it('does not progress-nudge submit_sources (call_end owns that reply)', () => {
    const nudges = createMcpNudgeTracker();
    const t0 = 1_000_000;
    nudges.ensure(1, t0);
    for (let i = 0; i < PROGRESS_STALE_CALLS + 2; i += 1) {
      nudges.noteToolSuccess(1, 'read_kit_file', t0 + i);
    }
    expect(nudges.warningsFor(1, 'submit_sources', t0 + 50_000).map((w) => w.code)).not.toContain('progress_stale');
  });
});
