// Text proposals: a described change, reviewer-visible once moderated.

import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { logModerationRejection } from '../platform/moderation-metrics.js';
import { rejectionFor } from '../platform/moderation.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import type { ProposalBase, ProposalRecord, Store } from '../platform/store.js';
import { ownerUidOf } from './owner-of-record.js';
import {
  announceAwaitingReview,
  canProposeTo,
  MAX_PROPOSAL_DESCRIPTION_LENGTH,
  MAX_PROPOSAL_TITLE_LENGTH,
  MIN_PROPOSAL_DESCRIPTION_LENGTH,
  type ProposalDeps,
  type ProposalRefusal,
} from './proposals.js';

// New proposals of any kind one proposer may open per hour.
export const MAX_PROPOSALS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;
const MIN_TITLE_LENGTH = 3;

// Same fallback as proposals.ts: no injected logger, nothing to write to.
const SILENT_LOG = { warn: () => {} } as unknown as FastifyBaseLogger;

export type TextProposalDeps = Pick<ProposalDeps, 'contentChecker' | 'log' | 'notify' | 'notifyOperators' | 'now'> & {
  store: Store;
  // The live snapshot pointer, recorded as a repo-lane game's base.
  readSnapshotPointer?: () => Promise<{ snapshotId: string; commitSha: string | null } | null>;
};

export interface TextProposalInput {
  targetSlug: string;
  proposerUid: string;
  title: string;
  description: string;
}

export type TextProposalResult =
  { ok: true; proposal: ProposalRecord } | { ok: false; status: number; error: string; category?: string };

// Status and public code for a refusal; `blocked` stays masked.
export function textRefusal(reason: ProposalRefusal): { status: number; error: string } {
  switch (reason) {
    case 'own_game':
    case 'not_published':
      return { status: 403, error: reason };
    case 'too_many_open':
    case 'too_many_open_here':
      return { status: 429, error: 'too_many_open' };
    case 'blocked':
    case 'contributions_off':
    default:
      return { status: 403, error: 'contributions_off' };
  }
}

async function baseFor(deps: TextProposalDeps, slug: string): Promise<ProposalBase> {
  const publication = await deps.store.getPublication(slug);
  if (publication) return { kind: 'store', version: publication.currentVersion };
  const pointer = await deps.readSnapshotPointer?.().catch(() => null);
  return { kind: 'repo', snapshotId: pointer?.snapshotId ?? '', sha: pointer?.commitSha ?? '' };
}

// Eligibility, hourly ceiling, moderation, then write and notify.
export async function openTextProposal(deps: TextProposalDeps, input: TextProposalInput): Promise<TextProposalResult> {
  const now = deps.now ?? Date.now;
  const eligible = await canProposeTo(deps.store, input.targetSlug, input.proposerUid);
  if (!eligible.ok) return { ok: false, ...textRefusal(eligible.reason) };

  const since = now() - HOUR_MS;
  const mine = await deps.store.listProposals({ proposerUid: input.proposerUid });
  if (mine.filter((record) => Date.parse(record.createdAt) > since).length >= MAX_PROPOSALS_PER_HOUR) {
    return { ok: false, status: 429, error: 'rate_limited' };
  }

  const title = sanitizeCreatorText(input.title, { singleLine: true }).slice(0, MAX_PROPOSAL_TITLE_LENGTH);
  const description = sanitizeCreatorText(input.description, { singleLine: false }).slice(
    0,
    MAX_PROPOSAL_DESCRIPTION_LENGTH,
  );
  if (title.length < MIN_TITLE_LENGTH) return { ok: false, status: 400, error: 'title_too_short' };
  if (description.length < MIN_PROPOSAL_DESCRIPTION_LENGTH) {
    return { ok: false, status: 400, error: 'description_too_short' };
  }

  if (deps.contentChecker) {
    const verdict = await deps.contentChecker.checkFields([title, description]);
    if (!verdict.allowed) {
      logModerationRejection(deps.log ?? SILENT_LOG, {
        surface: 'proposal',
        uid: input.proposerUid,
        category: verdict.category,
        unavailable: verdict.unavailable,
      });
      return { ok: false, ...rejectionFor(verdict) };
    }
  }

  const at = new Date(now()).toISOString();
  const record: ProposalRecord = {
    id: randomUUID(),
    targetSlug: input.targetSlug,
    targetOwnerUid: ownerUidOf(eligible.owner),
    proposerUid: input.proposerUid,
    base: await baseFor(deps, input.targetSlug),
    kind: 'text',
    state: 'in_review',
    stateSince: at,
    transitions: [
      { to: 'submitted', at, by: 'proposer', reason: 'opened' },
      { to: 'in_review', at, by: 'system', reason: 'text_only' },
    ],
    title,
    description,
    thread: [],
    createdAt: at,
    updatedAt: at,
  };
  await deps.store.putProposal(record);
  await announceAwaitingReview(deps, record);
  return { ok: true, proposal: record };
}
