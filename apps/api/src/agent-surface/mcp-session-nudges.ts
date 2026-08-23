/**
 * Soft session nudges for MCP tools — progress heartbeat + pending inbox.
 *
 * ChatGPT Apps (and similar) can spend many turns on read-only kit tools without
 * `report_progress`, so the Studio UI looks frozen; creator notes only ride writes.
 * These warnings are advisory (never `isError`) and are merged into successful tool
 * results by the MCP dispatcher.
 */

import type { SeedStatus } from '../seed-status.js';

export type NudgeCode =
  | 'progress_stale'
  | 'inbox_pending'
  | 'seed_unread'
  | 'transcript_unread'
  | 'call_end'
  | 'gate_not_started'
  | 'gate_poll_backoff'
  | 'card_unopened'
  | 'must_fix_gate'
  | 'must_deliver';

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
  seedStatus: SeedStatus | null;
  // Last-seen dispatchAttempt; a change re-arms transcriptFetched below.
  lastDispatchAttempt: number | null;
  // True after get_transcript since the last dispatch this tracker saw.
  transcriptFetched: boolean;
  // Bounds transcript_unread reminders so it cannot become noise.
  transcriptRemindersSent: number;
  /**
   * True after a successful submit_sources until `end` — subsequent tools re-emit
   * `call_end` so ChatGPT-class agents that keep chatting without ending still see it.
   */
  awaitingEnd: boolean;
  /** Wall-clock ms of the last successful get_gate_verdict in this tracker. */
  lastGatePollAt: number | null;
  /** True once show_round has opened the creator's card in this round. */
  cardOpened: boolean;
  /** How many times we have asked for it, so the reminder cannot become noise. */
  cardRemindersSent: number;
}

/** Minimum wall-clock gap used to detect repeated gate checks inside one agent run. */
export const GATE_POLL_MIN_INTERVAL_MS = 25_000;
/** Informational delay before a later creator-led run checks a pending gate again. */
export const GATE_POLL_RETRY_AFTER_SECONDS = 30;

/**
 * How many times to ask an agent to open the creator's card before letting it go.
 *
 * Bounded because the card is for the creator, not the build: an agent that ignores it
 * is not doing anything wrong, and a warning repeated on every response would crowd out
 * the ones that matter. Three is enough to catch an agent that simply did not notice
 * the step.
 */
export const CARD_REMINDER_LIMIT = 3;

// Same reasoning as CARD_REMINDER_LIMIT: bounded so it cannot crowd out later warnings.
export const TRANSCRIPT_REMINDER_LIMIT = 3;

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
  'get_kit_api',
  'list_kit_files',
  'search_kit_files',
  'read_kit_file',
  'read_kit_files',
  'read_kit_file_fragment',
  'get_sources',
  'list_examples',
  'get_example',
  'get_seed',
  'knowledge_query',
]);

/** Kit browse without get_seed while a draft is ready → seed_unread. */
export const SEED_NUDGE_TOOLS = new Set([
  'get_kit',
  'get_kit_api',
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
  noteSeedStatus(jobId: number, status: SeedStatus | null, nowMs: number): void;
  // Called with dispatchAttempt from a start/get_brief payload.
  noteDispatchAttempt(jobId: number, attempt: number, nowMs: number): void;
  /** Successful submit_sources — creator handoff may already be unlocked; still need `end`. */
  noteSubmitSuccess(jobId: number, nowMs: number): void;
  /** Successful MCP `end` — clear the post-submit call_end loop. */
  noteEnded(jobId: number, nowMs: number): void;
  /** `nowMs` is only used if the job has never been ensured — callers should pass the injected clock. */
  notePendingCount(jobId: number, count: number, nowMs: number): void;
  noteToolSuccess(jobId: number, toolName: string, nowMs: number): void;
  /** Called when show_round has put a card in front of the creator. */
  noteCardOpened(jobId: number, nowMs: number): void;
  warningsFor(jobId: number, toolName: string, nowMs: number, options?: { uiCapable?: boolean }): NudgeWarning[];
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
        lastDispatchAttempt: null,
        transcriptFetched: false,
        transcriptRemindersSent: 0,
        awaitingEnd: false,
        lastGatePollAt: null,
        cardOpened: false,
        cardRemindersSent: 0,
      };
      states.set(jobId, state);
    }
    return state;
  }

  function noteCardOpened(jobId: number, nowMs: number): void {
    ensure(jobId, nowMs).cardOpened = true;
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

  function noteSeedStatus(jobId: number, status: SeedStatus | null, nowMs: number): void {
    const state = ensure(jobId, nowMs);
    state.seedStatus = status;
  }

  function noteDispatchAttempt(jobId: number, attempt: number, nowMs: number): void {
    const state = ensure(jobId, nowMs);
    if (state.lastDispatchAttempt !== null && state.lastDispatchAttempt !== attempt) {
      // A new dispatch started — the earlier read no longer covers it.
      state.transcriptFetched = false;
      state.transcriptRemindersSent = 0;
    }
    state.lastDispatchAttempt = attempt;
  }

  function noteTranscriptFetch(jobId: number, nowMs: number): void {
    const state = ensure(jobId, nowMs);
    state.transcriptFetched = true;
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
    if (toolName === 'get_transcript') {
      noteTranscriptFetch(jobId, nowMs);
    }
    if (toolName === 'end') {
      noteEnded(jobId, nowMs);
    }
    if (!PROGRESS_NUDGE_EXEMPT.has(toolName)) {
      state.callsSinceProgress += 1;
    }
  }

  function warningsFor(
    jobId: number,
    toolName: string,
    nowMs: number,
    options: { uiCapable?: boolean } = {},
  ): NudgeWarning[] {
    const state = ensure(jobId, nowMs);
    const warnings: NudgeWarning[] = [];

    // Only where a card can actually render. Telling Claude Code or a headless agent to
    // call show_round is noise about a surface it does not have.
    //
    // Observed 2026-08-05: ChatGPT never called show_round on its own and the creator
    // had to ask for it, which makes the card effectively non-existent rather than
    // occasionally missing. The workflow step alone was not enough — the same lesson
    // `call_end` taught, so it gets the same remedy.
    if (
      options.uiCapable &&
      !state.cardOpened &&
      state.cardRemindersSent < CARD_REMINDER_LIMIT &&
      toolName !== 'show_round' &&
      toolName !== 'start'
    ) {
      state.cardRemindersSent += 1;
      warnings.push({
        code: 'card_unopened',
        message:
          'The creator has no status card for this round — call show_round once so they can watch the build ' +
          'and the gate without asking you. It is a read; it changes nothing.',
      });
    }

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

    // An earlier attempt exists; the brief no longer inlines the last message.
    if (
      (state.lastDispatchAttempt ?? 1) > 1 &&
      !state.transcriptFetched &&
      state.transcriptRemindersSent < TRANSCRIPT_REMINDER_LIMIT &&
      toolName !== 'get_transcript' &&
      toolName !== 'start'
    ) {
      state.transcriptRemindersSent += 1;
      warnings.push({
        code: 'transcript_unread',
        message:
          'This game has an earlier build attempt — earlier conversation may exist. Call get_transcript before ' +
          'deciding what to build; the latest message is the tail of a conversation, not the whole of it.',
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

    // Defense in depth for clients that repeat the one-shot check. A delivered pending
    // response carries stop:true; a no-delivery response tells the agent to keep building.
    if (toolName === 'get_gate_verdict') {
      if (state.lastGatePollAt !== null && nowMs - state.lastGatePollAt < GATE_POLL_MIN_INTERVAL_MS) {
        warnings.push({
          code: 'gate_poll_backoff',
          message: `Do not repeat get_gate_verdict in one run. If a delivery is pending, honour stop:true; if deliveryId is null, continue building and call submit_sources instead. A later creator-led run may check a delivered gate after retryAfterSeconds=${GATE_POLL_RETRY_AFTER_SECONDS} has elapsed.`,
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
    noteDispatchAttempt,
    noteSubmitSuccess,
    noteEnded,
    notePendingCount,
    noteToolSuccess,
    noteCardOpened,
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
