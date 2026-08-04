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

/** Tools that already write real progress / open rounds — never synthesize for these. */
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
]);
/**
 * Closed vocabulary for Studio thought headlines. Client translates via
 * `statusView.presence.<key>`; English `text` matches historical chat rows so
 * leftover durable steps can still be filtered from the transcript.
 */
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

const PRESENCE_EVENT_TEXTS = new Set(Object.values(PRESENCE_BY_TOOL).map((entry) => entry.text));

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

/**
 * Record a pulse timestamp with a simple LRU cap so long-lived instances cannot grow
 * the map without bound. Pure aside from mutating `pulses`.
 */
export function noteMcpPresencePulse(
  pulses: Map<number, number>,
  jobId: number,
  atMs: number,
  maxJobs: number = MAX_PRESENCE_PULSE_JOBS,
): void {
  pulses.delete(jobId);
  pulses.set(jobId, atMs);
  while (pulses.size > maxJobs) {
    const oldest = pulses.keys().next().value;
    if (oldest === undefined) break;
    pulses.delete(oldest);
  }
}

/**
 * Whether enough time has passed since the last pulse for this job.
 * Pure so tests can drive the clock; callers own the last-pulse map.
 */
export function shouldEmitMcpPresencePulse(
  lastPulseAtMs: number | undefined,
  nowMs: number,
  minGapMs: number = MCP_PRESENCE_MIN_GAP_MS,
): boolean {
  if (lastPulseAtMs === undefined) return true;
  return nowMs - lastPulseAtMs >= minGapMs;
}
