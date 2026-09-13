import { CliError, EXIT_REFUSED } from './exit-codes.js';
import type { ApiClient } from './api.js';
import type { CreatorProposal } from '@gamedevpl/contract';

export type TurnResult = { kind: 'reply'; text: string } | { kind: 'build'; ack?: string; roundId: number };
export type PreparedTurnResult = TurnResult | { kind: 'proposal'; ack?: string };

export async function prepareTurn(api: ApiClient, token: string, text: string): Promise<PreparedTurnResult> {
  return api.request('POST', `/api/submissions/${encodeURIComponent(token)}/turn`, { text, prepareOnly: true });
}

export async function postTurn(api: ApiClient, token: string, text: string): Promise<TurnResult> {
  return api.request<TurnResult>('POST', `/api/submissions/${encodeURIComponent(token)}/turn`, { text });
}

export async function getTurns(
  api: ApiClient,
  token: string,
): Promise<{ turns: Array<{ message: string; reply?: string }> }> {
  return api.request('GET', `/api/submissions/${encodeURIComponent(token)}/turns`);
}

export type RoundStatus = {
  status: string;
  slug?: string;
  builder?: string;
  phase?: string;
  gateProgress?: { stage: string; index: number; total: number };
  previewGate?: { green: boolean };
  preview?: { slug: string };
  stall?: string;
  failure?: { reason: string };
  // The studio thread, only as far as a concept card.
  progress?: { headSha?: string; revisions?: Array<{ origin?: string; proposal?: CreatorProposal }> };
};

export async function getStatus(api: ApiClient, token: string): Promise<RoundStatus> {
  return api.request('GET', `/api/submissions/${encodeURIComponent(token)}`);
}

export function isTerminalStatus(status: string): boolean {
  return status === 'published' || status === 'abandoned';
}

export function previewUrl(origin: string, slug: string): string {
  return `${origin}/play/${slug}`;
}

export function studioUrl(origin: string, slug: string): string {
  return `${origin}/studio/${slug}`;
}

// A card still waiting on the delivery it was drawn for.
export function latestProposal(status: RoundStatus): CreatorProposal | null {
  const delivered = status.progress?.headSha;
  const revisions = status.progress?.revisions ?? [];
  for (let at = revisions.length - 1; at >= 0; at -= 1) {
    const revision = revisions[at];
    // A retry can land a new delivery with the creator silent.
    if (revision?.proposal?.options?.length) {
      return delivered && revision.proposal.version === delivered ? revision.proposal : null;
    }
    // Only the studio's voice is no answer; 'agent' relays the creator.
    if (revision && revision.origin !== 'studio') return null;
  }
  return null;
}

export function assertNoBuild(kind: TurnResult['kind']): void {
  if (kind !== 'reply') {
    throw new CliError('expected a conversational reply, not a build', EXIT_REFUSED);
  }
}
