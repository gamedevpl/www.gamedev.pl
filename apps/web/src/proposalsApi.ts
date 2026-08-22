import { DECLINE_REASONS, type ContributionMode, type DeclineReason } from '@gamedevpl/contract';
export { DECLINE_REASONS, type DeclineReason };
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Proposals — a change to a game somebody else owns.
 *
 * The client sees three seats onto one resource, and they are separate calls rather than
 * one list with a role parameter: `myProposals` is what I sent, `myReviews` is what is
 * waiting on me, `platformProposals` is the operator queue. Keeping them apart here
 * mirrors the API, where the split is what stops one seat widening into another.
 *
 * Nothing in this module can publish anything. Accepting hands the game's owner a version
 * they then publish through the ordinary Studio flow.
 */

/** The proposer-facing vocabulary. `submitted`/`gating` arrive collapsed as `checking`. */
export type ProposalState =
  | 'draft'
  | 'checking'
  | 'in_review'
  | 'needs_work'
  | 'changes_requested'
  | 'accepted'
  | 'merged'
  | 'declined'
  | 'withdrawn'
  | 'superseded'
  | 'expired';

export type ProposalMessage = {
  id: string;
  from: 'proposer' | 'reviewer';
  text: string;
  createdAt: string;
};

export type Proposal = {
  id: string;
  targetSlug: string;
  proposerUid: string;
  state: ProposalState;
  title: string;
  description: string;
  base: { kind: 'store'; version: string } | { kind: 'repo'; snapshotId: string; sha: string };
  version?: string;
  createdAt: string;
  updatedAt: string;
  /** Absent until our checks have run. `screenshot` is the gate's own capture. */
  gate?: { green: boolean; ranAt: string; screenshot?: string };
  /** The proposal changes a committed behavioural golden — a finding, not a refusal. */
  behaviouralDiff?: boolean;
  thread: ProposalMessage[];
  decision?: { at: string; reason?: DeclineReason; note?: string };
  /** True when the reviewer is the platform rather than a creator. */
  platformOwned: boolean;
};

/** Why the "Propose this change" door is shut, when it is. */
export type ContributionRefusal =
  'contributions_off' | 'own_game' | 'not_published' | 'too_many_open_here' | 'too_many_open' | 'no_changes';

export type ContributionEligibility = { canPropose: true } | { canPropose: false; reason: ContributionRefusal };

export type DiffLine = { kind: 'context' | 'add' | 'del'; text: string; a?: number; b?: number };

export type FileDiff = {
  path: string;
  status: 'added' | 'removed' | 'modified';
  additions: number;
  deletions: number;
  lines: DiffLine[];
  /** This file's diff was cut short by the server's line cap. */
  truncated?: boolean;
};

export type ProposalDiff = {
  files: FileDiff[];
  additions: number;
  deletions: number;
  /** Changed files the server omitted. Surfaced, never swallowed. */
  omittedFiles: number;
};

export type ProposalApiError = Error & { status?: number; code?: string; category?: string };

/**
 * Coerce a list field to an array.
 *
 * A 200 whose body is missing the field is not an error the `catch` above can see, and the
 * component that renders it would throw on `.length` — which is how one shape-drifted
 * endpoint takes down the surface embedding it. Absent reads as empty, which is what an
 * absent list means everywhere else in this product.
 */
function asList<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });
  if (!response.ok) {
    // The body carries the machine-readable reason; the message is for a developer
    // reading a stack trace, never for a person reading the screen.
    let code: string | undefined;
    let category: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; category?: string };
      code = body.error;
      category = body.category;
    } catch {
      // A non-JSON error body is still an error; the status carries enough.
    }
    const error = new Error(`request failed with ${response.status}`) as ProposalApiError;
    error.status = response.status;
    error.code = code;
    error.category = category;
    throw error;
  }
  return (await response.json()) as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
}

/** Whether this game takes proposals from the signed-in player, and why not if it does not. */
export function checkContributions(slug: string): Promise<ContributionEligibility> {
  return request<ContributionEligibility>(`/api/games/${encodeURIComponent(slug)}/contributions`);
}

/**
 * Turn the current remix session into a proposal.
 *
 * Code overrides stay on the session; params and painted content live only in the
 * browser (same as save), so they travel with this request for the server to bake into
 * the candidate. Nothing the browser holds is compiled as game code.
 */
export function proposeFromRemix(
  remixId: string,
  input: {
    title: string;
    description: string;
    params?: Record<string, string | number | boolean>;
    content?: Record<string, unknown>;
  },
): Promise<{ proposal: { id: string; state: ProposalState } }> {
  return post(`/api/remixes/${encodeURIComponent(remixId)}/propose`, input);
}

export async function myProposals(): Promise<Proposal[]> {
  const { proposals } = await request<{ proposals?: Proposal[] }>('/api/proposals');
  return asList(proposals);
}

export async function myReviews(): Promise<Proposal[]> {
  const { proposals } = await request<{ proposals?: Proposal[] }>('/api/me/reviews');
  return asList(proposals);
}

export async function platformProposals(): Promise<Proposal[]> {
  const { proposals } = await request<{ proposals?: Proposal[] }>('/api/admin/proposals');
  return asList(proposals);
}

export async function getProposal(id: string): Promise<Proposal> {
  const { proposal } = await request<{ proposal: Proposal }>(`/api/proposals/${encodeURIComponent(id)}`);
  return proposal;
}

export async function getProposalDiff(id: string): Promise<ProposalDiff> {
  const { diff } = await request<{ diff: ProposalDiff }>(`/api/proposals/${encodeURIComponent(id)}/diff`);
  return { ...diff, files: asList(diff?.files) };
}

export async function withdrawProposal(id: string): Promise<Proposal> {
  const { proposal } = await post<{ proposal: Proposal }>(`/api/proposals/${encodeURIComponent(id)}/withdraw`);
  return proposal;
}

/**
 * Accept a proposal.
 *
 * Worth stating at the call site because the button's label cannot: this publishes
 * nothing. It creates a version on the owner's own shelf, gate-green and ready, which
 * they publish the way they publish everything else.
 */
export async function acceptProposal(id: string): Promise<Proposal> {
  const { proposal } = await post<{ proposal: Proposal }>(`/api/proposals/${encodeURIComponent(id)}/accept`);
  return proposal;
}

export async function declineProposal(id: string, reason: DeclineReason, note?: string): Promise<Proposal> {
  const { proposal } = await post<{ proposal: Proposal }>(`/api/proposals/${encodeURIComponent(id)}/decline`, {
    reason,
    ...(note ? { note } : {}),
  });
  return proposal;
}

export async function requestProposalChanges(id: string, text: string): Promise<Proposal> {
  const { proposal } = await post<{ proposal: Proposal }>(`/api/proposals/${encodeURIComponent(id)}/changes`, {
    text,
  });
  return proposal;
}

export type { ContributionMode };

export async function getContributionMode(slug: string): Promise<ContributionMode> {
  const { mode } = await request<{ mode?: ContributionMode }>(
    `/api/me/games/${encodeURIComponent(slug)}/contributions`,
  );
  // Unknown reads as `off`, the same failure direction the server takes: a game stays shut
  // rather than accidentally open when something upstream is not what we expected.
  return mode === 'review' ? 'review' : 'off';
}

export function setContributionMode(
  slug: string,
  mode: ContributionMode,
): Promise<{ ok: true; mode: ContributionMode }> {
  return request(`/api/me/games/${encodeURIComponent(slug)}/contributions`, {
    method: 'PUT',
    body: JSON.stringify({ mode }),
  });
}

export type ContributorBlock = { ownerUid: string; blockedUid: string; createdAt: string };

export async function listContributorBlocks(): Promise<ContributorBlock[]> {
  const { blocks } = await request<{ blocks?: ContributorBlock[] }>('/api/me/contributor-blocks');
  return asList(blocks);
}

export function blockContributor(uid: string): Promise<{ ok: true }> {
  return post('/api/me/contributor-blocks', { uid });
}

export function unblockContributor(uid: string): Promise<{ ok: true }> {
  return request('/api/me/contributor-blocks/' + encodeURIComponent(uid), { method: 'DELETE' });
}

/**
 * Whether this state is one the proposer can act on.
 *
 * Mirrors the server's `isProposerTurn` rather than being re-derived from the UI's needs:
 * two answers to "is it my move" is how a button appears that the API then refuses.
 */
export function isProposerTurn(state: ProposalState): boolean {
  return state === 'draft' || state === 'needs_work' || state === 'changes_requested';
}

/** Whether a proposal has been decided one way or another. */
export function isProposalClosed(state: ProposalState): boolean {
  return (
    state === 'merged' || state === 'declined' || state === 'withdrawn' || state === 'superseded' || state === 'expired'
  );
}
