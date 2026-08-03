/**
 * Coarse Studio presence pulses from MCP tool activity.
 *
 * ChatGPT Apps (and similar) often browse the kit for many turns with few
 * `report_progress` writes. Studio then looks idle even though the agent is busy.
 * These pulses ride successful session-authenticated tool calls — not 1:1 tool
 * logging — and are rate-limited so the build-event cap stays healthy.
 */

/** Minimum gap between synthetic presence events for one job. */
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
  'ack_inbox',
]);

const PRESENCE_COPY: Record<string, string> = {
  get_brief: 'Reading the build brief…',
  get_seed: 'Loading the seed draft…',
  get_kit: 'Fetching Creator Kit metadata…',
  list_kit_files: 'Browsing the Creator Kit…',
  search_kit_files: 'Searching the Creator Kit…',
  read_kit_file: 'Reading Creator Kit files…',
  read_kit_file_fragment: 'Reading Creator Kit files…',
  get_sources: 'Loading existing game sources…',
  list_examples: 'Browsing example games…',
  get_example: 'Reading an example game…',
  read_inbox: 'Checking creator notes…',
  get_gate_verdict: 'Waiting on automated checks…',
  get_gate_media: 'Reviewing gate captures…',
};

export function shouldPulseMcpPresence(toolName: string): boolean {
  if (NO_PULSE.has(toolName)) return false;
  return toolName in PRESENCE_COPY;
}

export function mcpPresenceText(toolName: string): string | null {
  return PRESENCE_COPY[toolName] ?? null;
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
