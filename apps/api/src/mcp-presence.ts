/**
 * Coarse Studio presence pulses from MCP tool activity.
 *
 * ChatGPT Apps (and similar) often browse the kit for many turns with few
 * `report_progress` writes. Studio then looks idle even though the agent is busy.
 * Pulses refresh `lastAgentSignalAt` (stall / heartbeat) and a short-lived
 * `lastAgentPresence` thought key for the thread bar — they must NOT append durable
 * build-event chat rows. Rate-limited so a read-heavy loop cannot hammer Firestore.
 */

/** Minimum gap between synthetic presence heartbeats for one job. */
export const MCP_PRESENCE_MIN_GAP_MS = 60_000;

/**
 * Tools that already write real progress / open rounds — never synthesize for these.
 *
 * `start` is handled separately in the MCP dispatcher: creator-key / OAuth openers have
 * no round Bearer to resolve a job id from, and a resume after `agentEndedAt` must clear
 * ended even when a recent gate-poll pulse would rate-limit a normal tool.
 */
const NO_PULSE = new Set([
  'start',
  'create_game',
  'open_round',
  'continue_draft',
  'report_progress',
  'send_screenshot',
  'submit_sources',
  // Channel PUT …/sources/stage (and POST …/stage/patch) refresh lastAgentSignalAt (+ staging_sources presence).
  'stage_source_file',
  'patch_source_file',
  'clear_staged_sources',
  'ack_inbox',
  // The round view polls this while a creator watches. A human with a chat window open
  // is not an agent working: pulsing here would refresh the heartbeat, hold off the
  // quiet stall, and keep self→platform handoff locked for as long as the tab is open.
  'get_round_status',
  'get_round_media',
]);
/**
 * Closed vocabulary for Studio thought headlines. Client translates via
 * `statusView.presence.<key>`; English `text` matches historical chat rows so
 * leftover durable steps can still be filtered from the transcript.
 *
 * `joining_round` is emitted from MCP `start` (not listed here — start stays in
 * {@link NO_PULSE} so the generic pulse path does not try to resolve a job id from a
 * creator-key Bearer).
 */
export const JOINING_ROUND_PRESENCE = {
  key: 'joining_round',
  text: 'Joining the build round…',
} as const;

const PRESENCE_BY_TOOL: Record<string, { key: string; text: string }> = {
  get_brief: { key: 'reading_brief', text: 'Reading the build brief…' },
  get_seed: { key: 'loading_seed', text: 'Loading the seed draft…' },
  get_kit: { key: 'fetching_kit', text: 'Fetching Creator Kit metadata…' },
  list_kit_files: { key: 'browsing_kit', text: 'Browsing the Creator Kit…' },
  search_kit_files: { key: 'searching_kit', text: 'Searching the Creator Kit…' },
  read_kit_file: { key: 'reading_kit', text: 'Reading Creator Kit files…' },
  read_kit_files: { key: 'reading_kit', text: 'Reading Creator Kit files…' },
  read_kit_file_fragment: { key: 'reading_kit', text: 'Reading Creator Kit files…' },
  get_sources: { key: 'loading_sources', text: 'Loading existing game sources…' },
  list_examples: { key: 'browsing_examples', text: 'Browsing example games…' },
  get_example: { key: 'reading_example', text: 'Reading an example game…' },
  list_staged_sources: { key: 'checking_staged', text: 'Checking staged sources…' },
  read_inbox: { key: 'checking_inbox', text: 'Checking creator notes…' },
  get_gate_verdict: { key: 'waiting_checks', text: 'Waiting on automated checks…' },
  get_gate_media: { key: 'reviewing_captures', text: 'Reviewing gate captures…' },
};

/**
 * Gate-poll presence must refresh the heartbeat without clearing `agentEndedAt`.
 * Submit auto-ends for handoff; agents are told to poll next — clearing ended on
 * those pulses would relock self→platform until quiet timeout.
 */
export const PRESENCE_PRESERVE_ENDED = new Set(['get_gate_verdict', 'get_gate_media']);

export function presencePreservesEnded(toolName: string): boolean {
  return PRESENCE_PRESERVE_ENDED.has(toolName);
}

const PRESENCE_EVENT_TEXTS = new Set([
  ...Object.values(PRESENCE_BY_TOOL).map((entry) => entry.text),
  JOINING_ROUND_PRESENCE.text,
]);

export function shouldPulseMcpPresence(toolName: string): boolean {
  if (NO_PULSE.has(toolName)) return false;
  // Own-property only — `in` would also match inherited keys like `toString`.
  return Object.hasOwn(PRESENCE_BY_TOOL, toolName);
}

/** Stable presence key for Studio i18n, or null when the tool does not pulse. */
export function mcpPresenceKey(toolName: string): string | null {
  return Object.hasOwn(PRESENCE_BY_TOOL, toolName) ? PRESENCE_BY_TOOL[toolName]!.key : null;
}

/** Historic English presence string (filter leftover chat rows). */
export function mcpPresenceText(toolName: string): string | null {
  return Object.hasOwn(PRESENCE_BY_TOOL, toolName) ? PRESENCE_BY_TOOL[toolName]!.text : null;
}

/** True when a durable step text is a leftover synthetic presence row (filter from chat). */
export function isMcpPresenceEventText(text: string): boolean {
  return PRESENCE_EVENT_TEXTS.has(text);
}

/** Cap for the in-process last-pulse map — oldest entries drop first (insertion order). */
export const MAX_PRESENCE_PULSE_JOBS = 2_000;

export type McpPresencePulse = { atMs: number; key: string };

/**
 * Record a pulse timestamp + thought key with a simple LRU cap so long-lived instances
 * cannot grow the map without bound. Pure aside from mutating `pulses`.
 */
export function noteMcpPresencePulse(
  pulses: Map<number, McpPresencePulse>,
  jobId: number,
  atMs: number,
  key: string,
  maxJobs: number = MAX_PRESENCE_PULSE_JOBS,
): void {
  pulses.delete(jobId);
  pulses.set(jobId, { atMs, key });
  while (pulses.size > maxJobs) {
    const oldest = pulses.keys().next().value;
    if (oldest === undefined) break;
    pulses.delete(oldest);
  }
}

/**
 * Whether this job may emit another presence pulse.
 *
 * Same thought key is rate-limited (kit-browse spam). A *different* key always
 * updates — creators should see Joining → Reading brief without waiting a minute.
 * Pure so tests can drive the clock; callers own the last-pulse map.
 */
export function shouldEmitMcpPresencePulse(
  last: McpPresencePulse | number | undefined,
  nowMs: number,
  minGapMs: number = MCP_PRESENCE_MIN_GAP_MS,
  nextKey?: string,
): boolean {
  if (last === undefined) return true;
  const lastAt = typeof last === 'number' ? last : last.atMs;
  const lastKey = typeof last === 'number' ? undefined : last.key;
  if (nextKey && lastKey && nextKey !== lastKey) return true;
  return nowMs - lastAt >= minGapMs;
}
