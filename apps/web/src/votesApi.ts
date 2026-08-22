// Client for game votes (docs/improvement-loop-plan.md, signal source #2). The read
// is public — `credentials: 'include'` just lets a signed-in caller also learn their
// own vote — but casting or clearing one needs a session, same as push subscriptions.

import type { VoteValue } from '@gamedevpl/contract';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type { VoteValue };

export interface VoteCounts {
  up: number;
  down: number;
  /** The caller's own vote, or null if they have none — always null when signed out. */
  mine: VoteValue | null;
}

export async function fetchVotes(slug: string): Promise<VoteCounts> {
  const res = await fetch(`${API_BASE}/api/games/${slug}/votes`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Votes request failed (${res.status})`);
  }
  return (await res.json()) as VoteCounts;
}

export async function castVote(slug: string, value: VoteValue): Promise<VoteCounts> {
  const res = await fetch(`${API_BASE}/api/games/${slug}/vote`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    throw new Error(`Vote request failed (${res.status})`);
  }
  return (await res.json()) as VoteCounts;
}

export async function clearVote(slug: string): Promise<VoteCounts> {
  const res = await fetch(`${API_BASE}/api/games/${slug}/vote`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Vote request failed (${res.status})`);
  }
  return (await res.json()) as VoteCounts;
}
