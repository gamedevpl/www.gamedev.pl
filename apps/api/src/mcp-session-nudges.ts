/**
 * Soft session nudges for MCP tools — progress heartbeat + pending inbox.
 *
 * ChatGPT Apps (and similar) can spend many turns on read-only kit tools without
 * `report_progress`, so the Studio UI looks frozen; creator notes only ride writes.
 * These warnings are advisory (never `isError`) and are merged into successful tool
 * results by the MCP dispatcher.
 *
 * Gate-poll busy-loops are different: Claude-class connectors ignored soft
 * `gate_poll_backoff` warnings and burned tool budgets. Those are hard-refused
 * (`isError`) via `gatePollBackoff` / the channel 429 — not soft-nudged.
 */

export type NudgeCode = 'progress_stale' | 'inbox_pending' | 'seed_unread' | 'call_end' | 'gate_not_started';

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
  /** True when that last successful poll returned status=pending (only those are throttled). */
  lastGatePollPending: boolean;
}

/** Minimum wall-clock gap between get_gate_verdict polls before hard refuse. */
export const GATE_POLL_MIN_INTERVAL_MS = 25_000;
/** Hint returned on pending gate reads — agents must wait this many seconds, not busy-poll. */
export const GATE_POLL_RETRY_AFTER_SECONDS = 30;

/** Presence key stamped on successful gate reads (Studio + durable backoff). */
export const GATE_POLL_PRESENCE_KEY = 'waiting_checks';

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

/**
 * Seconds to wait before the next poll, or null when the poll is allowed.
 * Pure — does not mutate tracker state.
 */
export function gatePollRetryAfterSeconds(lastPollAtMs: number | null, nowMs: number): number | null {
  if (lastPollAtMs === null) return null;
  const elapsed = nowMs - lastPollAtMs;
  if (elapsed >= GATE_POLL_MIN_INTERVAL_MS) return null;
  return Math.max(1, Math.ceil((GATE_POLL_MIN_INTERVAL_MS - elapsed) / 1000));
}

/**
 * Durable backoff from Studio presence: a recent `waiting_checks` stamp means a
 * successful gate poll already ran (this instance or another). Used by the channel
 * so Cloud Run instance hops cannot reset the in-process tracker.
 */
export function gatePollBackoffFromPresence(
  presence: { key: string; at: string } | undefined,
  nowMs: number,
): number | null {
  if (!presence || presence.key !== GATE_POLL_PRESENCE_KEY) return null;
  const atMs = Date.parse(presence.at);
  if (!Number.isFinite(atMs)) return null;
  return gatePollRetryAfterSeconds(atMs, nowMs);
}

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
  /**
   * Record a successful get_gate_verdict. Only `pending: true` polls count toward
   * the busy-poll interval — landed verdicts may be re-read immediately.
   */
  noteGatePoll(jobId: number, nowMs: number, pending: boolean): void;
  /**
   * In-process busy-poll check after a pending poll. Returns `{ retryAfterSeconds }`
   * when too soon; null when allowed (including after a landed verdict). Does not mutate.
   */
  gatePollBackoff(jobId: number, nowMs: number): { retryAfterSeconds: number } | null;
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
        lastGatePollPending: false,
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

  function noteGatePoll(jobId: number, nowMs: number, pending: boolean): void {
    const state = ensure(jobId, nowMs);
    state.lastGatePollAt = nowMs;
    state.lastGatePollPending = pending;
  }

  function gatePollBackoff(jobId: number, nowMs: number): { retryAfterSeconds: number } | null {
    const state = ensure(jobId, nowMs);
    if (!state.lastGatePollPending) return null;
    const retryAfterSeconds = gatePollRetryAfterSeconds(state.lastGatePollAt, nowMs);
    if (retryAfterSeconds === null) return null;
    return { retryAfterSeconds };
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
            ? 'Still waiting for end — do not busy-poll get_gate_verdict. Call end now if you will not deliver more this round; Studio shows the gate. Only re-poll after ~30s wall-clock if you still need the verdict to fix.'
            : 'Still waiting for end — call end now if you will not deliver more this round (Studio handoff may already be unlocked from submit).',
      });
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
    noteGatePoll,
    gatePollBackoff,
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
