/**
 * Coarse Studio presence pulses from MCP tool activity.
 *
 * ChatGPT Apps (and similar) often browse the kit for many turns with few
 * `report_progress` writes. Studio then looks idle even though the agent is busy.
 * Pulses only refresh `lastAgentSignalAt` on the submission (heartbeat / stall) —
 * they must NOT append durable build-event chat rows. Rate-limited so a read-heavy
 * loop cannot hammer Firestore.
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
  'stage_source_file',
  'clear_staged_sources',
  'ack_inbox',
]);

/**
 * Tools that count as "agent is working" for the heartbeat. Values are the English
 * strings historically written as `kind: 'step'` chat rows (filtered from status so
 * old threads stop showing them as messages).
 */
const PRESENCE_COPY: Record<string, string> = {
  get_brief: 'Reading the build brief…',
  get_seed: 'Loading the seed draft…',
  get_kit: 'Fetching Creator Kit metadata…',
  list_kit_files: 'Browsing the Creator Kit…',
  search_kit_files: 'Searching the Creator Kit…',
  read_kit_file: 'Reading Creator Kit files…',
  read_kit_files: 'Reading Creator Kit files…',
  read_kit_file_fragment: 'Reading Creator Kit files…',
  get_sources: 'Loading existing game sources…',
  list_examples: 'Browsing example games…',
  get_example: 'Reading an example game…',
  list_staged_sources: 'Checking staged sources…',
  read_inbox: 'Checking creator notes…',
  get_gate_verdict: 'Waiting on automated checks…',
  get_gate_media: 'Reviewing gate captures…',
};

const PRESENCE_EVENT_TEXTS = new Set(Object.values(PRESENCE_COPY));

export function shouldPulseMcpPresence(toolName: string): boolean {
  if (NO_PULSE.has(toolName)) return false;
  // Own-property only — `in` would also match inherited keys like `toString`.
  return Object.hasOwn(PRESENCE_COPY, toolName);
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
