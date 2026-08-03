/**
 * Soft session nudges for MCP tools — progress heartbeat + pending inbox.
 *
 * ChatGPT Apps (and similar) can spend many turns on read-only kit tools without
 * `report_progress`, so the Studio UI looks frozen; creator notes only ride writes.
 * These warnings are advisory (never `isError`) and are merged into successful tool
 * results by the MCP dispatcher.
 */

export type NudgeCode = 'progress_stale' | 'inbox_pending';

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
}

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
  'read_kit_file_fragment',
  'get_sources',
  'list_examples',
  'get_example',
  'get_seed',
]);

export interface McpNudgeTracker {
  ensure(jobId: number, nowMs: number): JobNudgeState;
  noteProgress(jobId: number, nowMs: number): void;
  noteInboxCheck(jobId: number, nowMs: number): void;
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

    return warnings;
  }

  return {
    ensure,
    noteProgress,
    noteInboxCheck,
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
