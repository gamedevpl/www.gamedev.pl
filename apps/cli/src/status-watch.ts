import { sanitizeEventPayload } from './ansi.js';
import { EXIT_GREEN, EXIT_RED } from './exit-codes.js';
import { createLiveScreen } from './live.js';
import { getStatus, isTerminalStatus, latestProposal, previewUrl, studioUrl, type RoundStatus } from './turn.js';
import type { ApiClient } from './api.js';
import type { CliTelemetry } from './telemetry.js';

// Back off unchanged active watches to bound orphaned polling.
const ACTIVE_BACKOFF_AFTER_POLLS = 20;
const ACTIVE_BACKOFF_CAP_MS = 30_000;

// A server floor above this is a bug, not a cadence to honour.
const SERVER_FLOOR_CAP_MS = 5 * 60_000;

export function statusWatchDelayMs(
  status: Pick<RoundStatus, 'status' | 'phase' | 'stall' | 'pollAfterMs'>,
  unchangedPolls = 0,
): number {
  return Math.max(clientDelayMs(status, unchangedPolls), serverFloorMs(status.pollAfterMs));
}

function clientDelayMs(status: Pick<RoundStatus, 'status' | 'phase' | 'stall'>, unchangedPolls: number): number {
  const active =
    status.status === 'building' ||
    status.phase === 'dispatched' ||
    status.stall === 'no_agent_yet' ||
    status.stall === 'ended' ||
    status.stall === 'quiet';
  if (!active) return 10_000;
  if (unchangedPolls < ACTIVE_BACKOFF_AFTER_POLLS) return 3000;
  const doublings = Math.floor((unchangedPolls - ACTIVE_BACKOFF_AFTER_POLLS) / ACTIVE_BACKOFF_AFTER_POLLS) + 1;
  return Math.min(3000 * 2 ** doublings, ACTIVE_BACKOFF_CAP_MS);
}

// The server knows when an answer could change; never poll under it.
function serverFloorMs(pollAfterMs: number | undefined): number {
  if (typeof pollAfterMs !== 'number' || !Number.isFinite(pollAfterMs) || pollAfterMs <= 0) return 0;
  return Math.min(pollAfterMs, SERVER_FLOOR_CAP_MS);
}

// Agent-authored text reaching a terminal; strip it like any payload.
function proposalLabels(status: RoundStatus): string {
  const proposal = latestProposal(status);
  if (!proposal) return '';
  return proposal.options.map((option) => `"${sanitizeEventPayload(option.label.en)}"`).join(' / ');
}

// The pick compares two pictures; route there, do not ask here.
export function proposalLines(status: RoundStatus, origin: string): string[] {
  const labels = proposalLabels(status);
  if (!labels) return [];
  const slug = status.slug ?? status.preview?.slug;
  const lines = [`concept directions waiting: ${labels}`];
  if (slug) lines.push(`pick one in Studio: ${studioUrl(origin, slug)}`);
  return lines;
}

export function formatStatusLines(status: RoundStatus, origin: string): string[] {
  const lines = [`${status.status}${status.stall ? ` (${status.stall})` : ''}`];
  if (status.gateProgress) {
    lines.push(`${status.gateProgress.stage} ${status.gateProgress.index}/${status.gateProgress.total}`);
  }
  if (status.preview?.slug) lines.push(previewUrl(origin, status.preview.slug));
  lines.push(...proposalLines(status, origin));
  if (status.failure?.reason) lines.push(sanitizeEventPayload(status.failure.reason));
  return lines;
}

export function statusFingerprint(status: RoundStatus): string {
  const gate = status.gateProgress;
  const preview = status.previewGate;
  return [
    status.status,
    status.phase ?? '',
    status.stall ?? '',
    gate ? `${gate.stage}:${gate.index}/${gate.total}` : '',
    status.preview?.slug ?? '',
    status.slug ?? '',
    status.failure?.reason ?? '',
    preview == null ? '' : preview.green ? '1' : '0',
    // A card lands after the boundary; without this it never announces.
    latestProposal(status)?.version ?? '',
  ].join('|');
}

const REPAIRABLE_REASONS = new Set(['gate_red', 'kit_outdated', 'gate_crashed', 'session_crashed']);

export function isRepairableNeedsChanges(status: RoundStatus): boolean {
  if (status.status !== 'needs_changes') return false;
  const reason = status.failure?.reason ? sanitizeEventPayload(status.failure.reason) : '';
  if (reason && REPAIRABLE_REASONS.has(reason)) return true;
  return status.previewGate?.green === false;
}

// A publish watched happen here, not a game already live.
export function isPublishTransition(previous: string, next: string): boolean {
  return next === 'published' && previous !== '' && previous !== 'published';
}

export function isRoundBoundary(status: RoundStatus): boolean {
  if (isTerminalStatus(status.status)) return true;
  // A green preview leaves the job building; the card is news.
  if (latestProposal(status)) return true;
  return status.status === 'needs_changes' && !isRepairableNeedsChanges(status);
}

export function formatStatusEvent(status: RoundStatus): string {
  if (isRepairableNeedsChanges(status)) {
    const why = status.failure?.reason ?? 'preview red';
    return `needs_changes (${sanitizeEventPayload(why)})`;
  }
  const labels = proposalLabels(status);
  const finished = status.status === 'needs_changes' && status.previewGate?.green;
  // A card can land while the job still reads building.
  if (labels) return `${finished ? 'round finished — ' : ''}Studio has concept directions: ${labels}`;
  if (finished) {
    return 'round finished — Studio is waiting (preview green)';
  }
  if (status.status === 'needs_changes') {
    const why = status.failure?.reason ? ` (${sanitizeEventPayload(status.failure.reason)})` : '';
    return `round finished — needs_changes${why}`;
  }
  if (status.status === 'published') return 'published';
  if (status.status === 'abandoned') return 'abandoned';
  const stall = status.stall ? ` (${status.stall})` : '';
  if (status.gateProgress) {
    const { stage, index, total } = status.gateProgress;
    return `${status.status}${stall} · ${stage} ${index}/${total}`;
  }
  return `${status.status}${stall}`;
}

export function shouldAnnounceStatus(status: RoundStatus, previousKey: string, key: string): boolean {
  if (key === previousKey) return false;
  return isRoundBoundary(status);
}

export function formatRoundLive(status: RoundStatus, origin: string): string[] {
  const lines = [formatStatusEvent(status)];
  if (status.preview?.slug) lines.push(previewUrl(origin, status.preview.slug));
  // The event names the directions; this says where to act.
  const slug = status.slug ?? status.preview?.slug;
  if (slug && latestProposal(status)) lines.push(`pick one in Studio: ${studioUrl(origin, slug)}`);
  const reason = status.failure?.reason ? sanitizeEventPayload(status.failure.reason) : '';
  if (reason && !lines[0]?.includes(reason)) lines.push(reason);
  return lines.slice(0, 4);
}

export async function runStatusVerb(input: {
  api: ApiClient;
  token: string;
  maxPolls: number;
  asJson: boolean;
  live: boolean;
  stdout: NodeJS.WriteStream;
  telemetry?: CliTelemetry;
  sleep?: (ms: number) => Promise<void>;
}): Promise<number> {
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const screen = input.live ? createLiveScreen(input.stdout) : null;
  let status = await getStatus(input.api, input.token);
  let watched = '';
  let lastKey = '';
  // A watch left open on an idle job must slow down, like the TUI's.
  let unchangedPolls = 0;
  for (let i = 1; i <= input.maxPolls; i += 1) {
    if (isPublishTransition(watched, status.status)) input.telemetry?.record('published');
    watched = status.status;
    if (input.asJson) input.stdout.write(`${JSON.stringify(status)}\n`);
    else if (screen) screen.paint(formatStatusLines(status, input.api.origin));
    else {
      for (const line of formatStatusLines(status, input.api.origin)) input.stdout.write(`${line}\n`);
    }
    if (i === input.maxPolls || isTerminalStatus(status.status)) break;
    const key = statusFingerprint(status);
    unchangedPolls = key === lastKey ? unchangedPolls + 1 : 0;
    lastKey = key;
    await sleep(statusWatchDelayMs(status, unchangedPolls));
    status = await getStatus(input.api, input.token);
  }
  if (status.failure?.reason === 'gate_red' || status.previewGate?.green === false) return EXIT_RED;
  return EXIT_GREEN;
}
