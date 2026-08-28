import { CliError, EXIT_REFUSED } from './exit-codes.js';
import type { ApiClient } from './api.js';

export type TurnResult = { kind: 'reply'; text: string } | { kind: 'build'; ack?: string; roundId: number };

export async function postTurn(api: ApiClient, token: string, text: string): Promise<TurnResult> {
  return api.request<TurnResult>('POST', `/api/submissions/${encodeURIComponent(token)}/turn`, { text });
}

export async function getTurns(
  api: ApiClient,
  token: string,
): Promise<{ turns: Array<{ message: string; reply?: string }> }> {
  return api.request('GET', `/api/submissions/${encodeURIComponent(token)}/turns`);
}

export async function getStatus(
  api: ApiClient,
  token: string,
): Promise<{
  status: string;
  gateProgress?: { stage: string; index: number; total: number };
  previewGate?: { green: boolean };
  preview?: { slug: string };
  stall?: string;
  failure?: { reason: string };
}> {
  return api.request('GET', `/api/submissions/${encodeURIComponent(token)}`);
}

export function previewUrl(origin: string, slug: string): string {
  return `${origin}/play/${slug}`;
}

export function assertNoBuild(kind: TurnResult['kind']): void {
  if (kind !== 'reply') {
    throw new CliError('expected a conversational reply, not a build', EXIT_REFUSED);
  }
}
