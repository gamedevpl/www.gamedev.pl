/**
 * Soft session nudges for MCP tools — progress heartbeat + pending inbox.
 *
 * ChatGPT Apps (and similar) can spend many turns on read-only kit tools without
 * `report_progress`, so the Studio UI looks frozen; creator notes only ride writes.
 * These warnings are advisory (never `isError`) and are merged into successful tool
 * results by the MCP dispatcher.
 */

export type NudgeCode =
  'progress_stale' | 'inbox_pending' | 'seed_unread' | 'call_end' | 'gate_not_started' | 'gate_poll_backoff';

export interface NudgeWarning {
  code: NudgeCode;
  message: string;
}

export interface JobNudgeState {
  startedAt: number;
  lastProgressAt: number | null;
  callsSinceProgress: number;
  pendingCount: number;
  lastInboxCheckAt: number | null;
  /** True after a successful get_seed in this MCP session tracker. */
  seedFetched: boolean;
  /** Last known seedStatus from brief/seed payloads. */
  seedStatus: 'pending' | 'available' | 'unavailable' | null;
  /**
   * True after a successful submit_sources until `end` — subsequent tools re-emit
   * `call_end` so ChatGPT-class agents that keep chatting without ending still see it.
   */
  awaitingEnd: boolean;
  /** Wall-clock ms of the last successful get_gate_verdict in this tracker. */
  lastGatePollAt: number | null;
}

/** Minimum wall-clock gap used to detect a client that ignored pending's `stop:true`. */
export const GATE_POLL_MIN_INTERVAL_MS = 25_000;
/** Informational delay before a later creator-led run checks a pending gate again. */
export const GATE_POLL_RETRY_AFTER_SECONDS = 30;

/** No progress for this long (wall clock) → `progress_stale`. */
export const PROGRESS_STALE_MS = 90_000;
/** Or this many successful tools since the last progress report. */
export const PROGRESS_STALE_CALLS = 6;

/** Tools that should not emit a progress_stale warning. */
export const PROGRESS_NUDGE_EXEMPT = new Set([
  'start',
  'create_game',
  'open_round',
  'report_progress',
  'get_gate_verdict',
  'read_inbox',
  'ack_inbox',
  'end',
  // Submit already carries call_end / gate_not_started — progress_stale on the same
  // reply drowned the handoff instruction for ChatGPT-class agents.
  'submit_sources',
]);

/**
 * Read tools that otherwise never see `pendingMessages`. The dispatcher piggybacks
 * a fresh inbox peek onto these so a read-heavy loop still learns about creator notes.
 */
export const INBOX_PIGGYBACK_TOOLS = new Set([
  'get_kit',
  'list_kit_files',
  'search_kit_files',
  'read_kit_file',
  'read_kit_files',
  'read_kit_file_fragment',
  'get_sources',
  'list_examples',
  'get_example',
  'get_seed',
]);

/** Kit browse without get_seed while a draft is ready → seed_unread. */
export const SEED_NUDGE_TOOLS = new Set([
  'get_kit',
  'list_kit_files',
  'search_kit_files',
  'read_kit_file',
  'read_kit_files',
  'read_kit_file_fragment',
]);

export interface McpNudgeTracker {
  ensure(jobId: number, nowMs: number): JobNudgeState;
  noteProgress(jobId: number, nowMs: number): void;
  noteInboxCheck(jobId: number, nowMs: number): void;
  noteSeedFetch(jobId: number, nowMs: number): void;
  noteSeedStatus(jobId: number, status: 'pending' | 'available' | 'unavailable' | null, nowMs: number): void;
  /** Successful submit_sources — creator handoff may already be unlocked; still need `end`. */
  noteSubmitSuccess(jobId: number, nowMs: number): void;
  /** Successful MCP `end` — clear the post-submit call_end loop. */
  noteEnded(jobId: number, nowMs: number): void;
  /** `nowMs` is only used if the job has never been ensured — callers should pass the injected clock. */
  notePendingCount(jobId: number, count: number, nowMs: number): void;
  noteToolSuccess(jobId: number, toolName: string, nowMs: number): void;
  warningsFor(jobId: number, toolName: string, nowMs: number): NudgeWarning[];
  /** Test helper. */
  peek(jobId: number): JobNudgeState | undefined;
}

export function createMcpNudgeTracker(
  options: { progressStaleMs?: number; progressStaleCalls?: number } = {},
): McpNudgeTracker {
  const progressStaleMs = options.progressStaleMs ?? PROGRESS_STALE_MS;
  const progressStaleCalls = options.progressStaleCalls ?? PROGRESS_STALE_CALLS;
  const states = new Map<number, JobNudgeState>();

  function ensure(jobId: number, nowMs: number): JobNudgeState {
    let state = states.get(jobId);
    if (!state) {
      state = {
        startedAt: nowMs,
        lastProgressAt: null,
        callsSinceProgress: 0,
        pendingCount: 0,
        lastInboxCheckAt: null,
        seedFetched: false,
        seedStatus: null,
        awaitingEnd: false,
        lastGatePollAt: null,
      };
      states.set(jobId, state);
    }
    return state;
  }

  function noteProgress(jobId: number, nowMs: number): void {
    const state = ensure(jobId, nowMs);
    state.lastProgressAt = nowMs;
    state.callsSinceProgress = 0;
  }

  function noteInboxCheck(jobId: number, nowMs: number): void {
    const state = ensure(jobId, nowMs);
    state.lastInboxCheckAt = nowMs;
  }

  function noteSeedFetch(jobId: number, nowMs: number): void {
    const state = ensure(jobId, nowMs);
    state.seedFetched = true;
  }

  function noteSeedStatus(jobId: number, status: 'pending' | 'available' | 'unavailable' | null, nowMs: number): void {
    const state = ensure(jobId, nowMs);
    state.seedStatus = status;
  }

  function noteSubmitSuccess(jobId: number, nowMs: number): void {
    const state = ensure(jobId, nowMs);
    state.awaitingEnd = true;
  }

  function noteEnded(jobId: number, nowMs: number): void {
    const state = ensure(jobId, nowMs);
    state.awaitingEnd = false;
  }

  function notePendingCount(jobId: number, count: number, nowMs: number): void {
    const state = ensure(jobId, nowMs);
    state.pendingCount = Math.max(0, count);
  }

  function noteToolSuccess(jobId: number, toolName: string, nowMs: number): void {
    const state = ensure(jobId, nowMs);
    if (toolName === 'report_progress') {
      noteProgress(jobId, nowMs);
      return;
    }
    if (toolName === 'read_inbox' || toolName === 'ack_inbox') {
      noteInboxCheck(jobId, nowMs);
    }
    if (toolName === 'get_seed') {
      noteSeedFetch(jobId, nowMs);
    }
    if (toolName === 'end') {
      noteEnded(jobId, nowMs);
    }
    if (!PROGRESS_NUDGE_EXEMPT.has(toolName)) {
      state.callsSinceProgress += 1;
    }
  }

  function warningsFor(jobId: number, toolName: string, nowMs: number): NudgeWarning[] {
    const state = ensure(jobId, nowMs);
    const warnings: NudgeWarning[] = [];

    if (!PROGRESS_NUDGE_EXEMPT.has(toolName)) {
      const anchor = state.lastProgressAt ?? state.startedAt;
      const staleByTime = nowMs - anchor >= progressStaleMs;
      const staleByCalls = state.callsSinceProgress >= progressStaleCalls;
      if (staleByTime || staleByCalls) {
        warnings.push({
          code: 'progress_stale',
          message:
            'No recent report_progress — call report_progress with a short status so the creator sees you are still working, then continue.',
        });
      }
    }

    if (state.pendingCount > 0 && toolName !== 'read_inbox') {
      warnings.push({
        code: 'inbox_pending',
        message: `Creator inbox has ${state.pendingCount} pending message(s) — call read_inbox, apply them, ack_inbox, then continue.`,
      });
    }

    if (
      SEED_NUDGE_TOOLS.has(toolName) &&
      state.seedStatus === 'available' &&
      !state.seedFetched &&
      toolName !== 'get_seed'
    ) {
      warnings.push({
        code: 'seed_unread',
        message: 'A seed draft is available — call get_seed and continue that draft before scaffolding from the kit.',
      });
    }

    // Re-emit after submit until end — ChatGPT often stops on the submit reply itself,
    // but when it keeps chatting this keeps call_end in every subsequent tool result.
    if (state.awaitingEnd && toolName !== 'end' && toolName !== 'submit_sources') {
      warnings.push({
        code: 'call_end',
        message:
          toolName === 'get_gate_verdict'
            ? 'Still waiting for end — get_gate_verdict is a one-shot check, not a loop. Honour stop:true on pending and let Studio show the gate.'
            : 'Still waiting for end — call end now if you will not deliver more this round (Studio handoff may already be unlocked from submit).',
      });
    }

    // Defense in depth for clients that ignore pending's stop:true. The stop is carried
    // directly by every pending response; this warning makes an ignored stop unmistakable.
    if (toolName === 'get_gate_verdict') {
      if (state.lastGatePollAt !== null && nowMs - state.lastGatePollAt < GATE_POLL_MIN_INTERVAL_MS) {
        const waitSec = Math.max(1, Math.ceil((GATE_POLL_MIN_INTERVAL_MS - (nowMs - state.lastGatePollAt)) / 1000));
        warnings.push({
          code: 'gate_poll_backoff',
          message: `You ignored stop:true from a pending gate. STOP this run now; do not call get_gate_verdict or any other tool again. Studio will show the result. A later creator-led run may check again after ~${waitSec}s (retryAfterSeconds=${GATE_POLL_RETRY_AFTER_SECONDS}).`,
        });
      }
      state.lastGatePollAt = nowMs;
    }

    return warnings;
  }

  return {
    ensure,
    noteProgress,
    noteInboxCheck,
    noteSeedFetch,
    noteSeedStatus,
    noteSubmitSuccess,
    noteEnded,
    notePendingCount,
    noteToolSuccess,
    warningsFor,
    peek: (jobId) => states.get(jobId),
  };
}

/** Pull pendingMessages / pending arrays out of a tool result payload. */
export function pendingCountFromPayload(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const list = obj.pendingMessages ?? obj.pending ?? obj.messages;
  if (!Array.isArray(list)) return null;
  return list.length;
}
