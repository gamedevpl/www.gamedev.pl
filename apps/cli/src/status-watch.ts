import { EXIT_GREEN } from './exit-codes.js';
import { createLiveScreen } from './live.js';
import { getStatus, isTerminalStatus, previewUrl, type RoundStatus } from './turn.js';
import type { ApiClient } from './api.js';

export function statusWatchDelayMs(status: Pick<RoundStatus, 'status' | 'phase' | 'stall'>): number {
  const active =
    status.status === 'building' ||
    status.phase === 'dispatched' ||
    status.stall === 'no_agent_yet' ||
    status.stall === 'ended' ||
    status.stall === 'quiet';
  return active ? 3000 : 10_000;
}

export function formatStatusLines(status: RoundStatus, origin: string): string[] {
  const lines = [`${status.status}${status.stall ? ` (${status.stall})` : ''}`];
  if (status.gateProgress) {
    lines.push(`${status.gateProgress.stage} ${status.gateProgress.index}/${status.gateProgress.total}`);
  }
  if (status.preview?.slug) lines.push(previewUrl(origin, status.preview.slug));
  if (status.failure?.reason) lines.push(status.failure.reason);
  return lines;
}

export async function runStatusVerb(input: {
  api: ApiClient;
  token: string;
  maxPolls: number;
  asJson: boolean;
  live: boolean;
  stdout: NodeJS.WriteStream;
  sleep?: (ms: number) => Promise<void>;
}): Promise<number> {
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const screen = input.live ? createLiveScreen(input.stdout, input.stdout.columns ?? 80) : null;
  let status = await getStatus(input.api, input.token);
  for (let i = 1; i <= input.maxPolls; i += 1) {
    if (input.asJson) input.stdout.write(`${JSON.stringify(status)}\n`);
    else if (screen) screen.paint(formatStatusLines(status, input.api.origin));
    else {
      for (const line of formatStatusLines(status, input.api.origin)) input.stdout.write(`${line}\n`);
    }
    if (i === input.maxPolls || isTerminalStatus(status.status)) break;
    await sleep(statusWatchDelayMs(status));
    status = await getStatus(input.api, input.token);
  }
  return EXIT_GREEN;
}
