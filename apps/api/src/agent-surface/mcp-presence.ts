/**
 * Coarse Studio presence pulses from MCP tool activity.
 *
 * Kit-browse loops rarely call `report_progress`, so Studio looked idle while the
 * agent was busy. Pulses refresh `lastAgentSignalAt` and a short-lived
 * `lastAgentPresence` key — never durable chat rows. Same-key pulses are
 * rate-limited so a read-heavy loop cannot hammer Firestore.
 */

/** Minimum gap between same-key synthetic presence heartbeats for one job. */
export const MCP_PRESENCE_MIN_GAP_MS = 60_000;

/**
 * Tools that already write real progress / open rounds — never synthesize.
 *
 * `start` pulses in the MCP dispatcher (creator-key openers have no round Bearer;
 * resume must clear `agentEndedAt` even after a recent gate-poll pulse).
 */
const NO_PULSE = new Set([
  'start',
  'create_game',
  'open_round',
  'continue_draft',
  'report_progress',
  // Mint-only; the signed PUT stores the shot / staged file.
  'screenshot_upload_url',
  'stage_upload_url',
  'submit_sources',
  // Channel stage/patch already refresh lastAgentSignalAt (+ staging_sources).
  'stage_source_file',
  'patch_source_file',
  'clear_staged_sources',
  'ack_inbox',
  // Creator card polls — not agent work; skip.
  'get_round_status',
  'get_round_media',
]);

/**
 * Closed vocabulary for Studio thought headlines (`statusView.presence.<key>`).
 * English `text` matches historic chat rows filtered from the transcript.
 *
 * `joining_round` comes from MCP `start` (see dispatcher), not this map.
 */
export const JOINING_ROUND_PRESENCE = {
  key: 'joining_round',
  text: 'Joining the build round…',
} as const;

const PRESENCE_BY_TOOL: Record<string, { key: string; text: string }> = {
  get_brief: { key: 'reading_brief', text: 'Reading the build brief…' },
  get_seed: { key: 'loading_seed', text: 'Loading the seed draft…' },
  get_kit: { key: 'fetching_kit', text: 'Fetching Creator Kit metadata…' },
  get_kit_api: { key: 'reading_kit_api', text: 'Reading the Creator Kit API reference…' },
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
  get_transcript: { key: 'reading_conversation', text: 'Reading the conversation…' },
  get_gate_verdict: { key: 'waiting_checks', text: 'Waiting on automated checks…' },
  get_gate_media: { key: 'reviewing_captures', text: 'Reviewing gate captures…' },
};

/**
 * Gate-poll presence refreshes the heartbeat without clearing `agentEndedAt`.
 * Submit auto-ends for handoff; clearing ended on those pulses would relock it.
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

// Exact #661 merge instant — presence pulses stopped writing chat rows here.
const PRESENCE_CHAT_LEFTOVER_CUTOFF_MS = Date.parse('2026-08-07T13:01:20.000Z');

// True for a leftover presence row written before the cutoff.
export function isMcpPresenceEventText(text: string, createdAt?: string): boolean {
  if (!PRESENCE_EVENT_TEXTS.has(text)) return false;
  if (createdAt === undefined) return true;
  const createdAtMs = Date.parse(createdAt);
  return Number.isNaN(createdAtMs) || createdAtMs < PRESENCE_CHAT_LEFTOVER_CUTOFF_MS;
}

/** Cap for the in-process last-pulse map — oldest entries drop first. */
export const MAX_PRESENCE_PULSE_JOBS = 2_000;

export type McpPresencePulse = { atMs: number; key: string };

/** Record pulse at+key with LRU cap. Pure aside from mutating `pulses`. */
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
 * Same key is rate-limited; a different key always updates (Joining → brief).
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
