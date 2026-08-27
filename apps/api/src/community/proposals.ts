// Proposals: a change to a game somebody else owns.
//
// The shape is deliberately small, because almost everything it needs already exists. A
// proposal is an immutable candidate version written into the target game's own prefix
// and marked `deliveryMode: 'proposal'`, plus a record saying who sent it, what it is
// based on, and what state the review is in. The gate that checks it is the same gate that
// checks a creator's own delivery. Acceptance is the existing improvement-round machinery
// pointed at a version that already has a green verdict. Publication is untouched: the
// game's owner publishes an accepted change the way they publish everything else.
//
// Three rules hold the whole thing up, and each is enforced somewhere a forgetful caller
// cannot route around:
//
// 1. **A proposal never publishes.** `isPublishableMode` refuses proposal-mode versions in
//    every publish path, and `adoptProposalVersion` — the only way out of that mode —
//    requires a green gate and an accepting owner.
// 2. **A proposer never gains scope.** They read the target's *published* sources and
//    deliver through the same server-side allowlist as anyone else. There is no path that
//    names `shared/`, `tools/`, or another game.
// 3. **A creator is never surprised by one.** Contributions are off by default, per game,
//    and a proposal that has not passed the gate is invisible to its reviewer.
//
// What this module does *not* do is decide who the reviewer is (see `owner-of-record.ts`)
// or serve any HTTP (see `proposal-routes.ts`). It is the domain layer both of those call.

import { randomUUID } from 'node:crypto';
import type { ContributionMode } from '@gamedevpl/contract';
import type { FastifyBaseLogger } from 'fastify';
import { logModerationRejection } from '../platform/moderation-metrics.js';
import type { ContentChecker } from '../platform/moderation.js';
import type { GamesStore, SourceFile } from '../delivery/games-store.js';
import { ownerUidOf, resolveOwnerOfRecord, reviewerKindOf, type OwnerOfRecord } from './owner-of-record.js';
import { isRepoBaseStale } from './proposal-base.js';
import {
  countsAsOpen,
  isBaseStale,
  isReviewerVisible,
  MAX_OPEN_PROPOSALS_PER_PROPOSER,
  MAX_OPEN_PROPOSALS_PER_TARGET,
  MAX_PROPOSAL_TRANSITIONS,
  owesStatementOfReasons,
  PROPOSAL_EXPIRY_MS,
  canTransitionProposal,
  type DeclineReason,
  type ProposalActor,
  type ProposalState,
} from './proposal-state.js';
import {
  MAX_PROPOSAL_MESSAGES,
  type ProposalBase,
  type ProposalMessage,
  type ProposalRecord,
  type Store,
} from '../platform/store.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import { isPublished } from '../platform/publication-state.js';

/**
 * `issueNumber` written onto a proposal's version manifest.
 *
 * Zero, because a proposal has no job — and it must not have one. A submission record for
 * a proposal would be owned by the proposer and carry the target's slug, which is exactly
 * the shape `creatorOwnsSlug` reads as a transfer: sending a proposal would take the game
 * away from the person you sent it to. Job ids start at `JOB_ID_FLOOR` (1,000,000), so
 * zero is unambiguously "no job" and every equality check against a real job id already
 * refuses it. The real provenance lives in `manifest.proposal`.
 */
export const PROPOSAL_NO_JOB = 0;

/**
 * Fallback when no logger was injected — a sweep or a test calling the domain layer
 * directly. Dropping the line is right there: the rejection still reaches the caller, and
 * inventing a console write from a library module would put request-shaped noise in
 * contexts that have no request.
 */
const SILENT_LOG = { warn: () => {} } as unknown as FastifyBaseLogger;

export const MAX_PROPOSAL_TITLE_LENGTH = 120;
export const MIN_PROPOSAL_DESCRIPTION_LENGTH = 20;
export const MAX_PROPOSAL_DESCRIPTION_LENGTH = 2000;
export const MAX_PROPOSAL_MESSAGE_LENGTH = 2000;

export type ProposalRefusal =
  | 'contributions_off'
  | 'blocked'
  | 'own_game'
  | 'not_published'
  | 'too_many_open_here'
  | 'too_many_open'
  | 'no_changes';

export interface ProposalDeps {
  store: Store;
  gamesStore: GamesStore;
  contentChecker?: ContentChecker;
  /**
   * Where moderation rejections are reported.
   *
   * Logged here rather than in the route because this is the layer that knows which field
   * tripped and whose it was; a route can only say "something in that request". The repo's
   * moderation-metrics guard enforces one report per rejection branch, and that guard is
   * the reason the alert on rejection bursts can be trusted to see all of them.
   */
  log?: FastifyBaseLogger;
  /**
   * Tells somebody a proposal moved.
   *
   * Injected rather than imported so the domain layer keeps no mailer, push or template
   * dependency, and so a sweep can run without one. Every call is best effort: a proposal
   * whose notification failed is still in the right state, and the surfaces show it.
   */
  notify?: (event: {
    uid: string;
    type: 'proposal.awaiting_review' | 'proposal.decided' | 'proposal.merged';
    proposalId: string;
    gameTitle: string;
  }) => Promise<unknown>;
  now?: () => number;
}

/** Best-effort notification. Never lets a delivery failure change a proposal's outcome. */
async function tell(deps: ProposalDeps, event: Parameters<NonNullable<ProposalDeps['notify']>>[0]): Promise<void> {
  if (!deps.notify) return;
  try {
    await deps.notify(event);
  } catch (error) {
    deps.log?.error?.({ err: error, proposalId: event.proposalId }, 'proposal notification failed');
  }
}

/** Default contribution mode for a game nobody has configured. */
export const DEFAULT_CONTRIBUTION_MODE: ContributionMode = 'off';

export async function contributionModeFor(store: Store, slug: string): Promise<ContributionMode> {
  const settings = await store.getContributionSettings(slug);
  return settings?.mode ?? DEFAULT_CONTRIBUTION_MODE;
}

/**
 * Whether `proposerUid` may open a proposal against `slug` right now.
 *
 * Ordered cheapest-and-most-private first: a blocked person and a contributions-off game
 * get the same refusal shape they would get anyway, and neither costs a storage read of
 * the target's publication. The caps come last because they are the only checks that need
 * the proposal collection.
 *
 * Returns the resolved owner alongside the verdict so the caller does not resolve it
 * twice — and, more importantly, so the record it writes is stamped with the same owner
 * this decision was made against.
 */
export async function canProposeTo(
  store: Store,
  slug: string,
  proposerUid: string,
): Promise<{ ok: true; owner: OwnerOfRecord } | { ok: false; reason: ProposalRefusal }> {
  const owner = await resolveOwnerOfRecord(store, slug);

  // Proposing to yourself is not a refusal so much as a wrong door: the owner of a game
  // has improvement rounds, which do everything a proposal does without a review step.
  if (owner.kind === 'creator' && owner.uid === proposerUid) {
    return { ok: false, reason: 'own_game' };
  }

  if (owner.kind === 'creator') {
    if (await store.isContributorBlocked(owner.uid, proposerUid)) {
      return { ok: false, reason: 'blocked' };
    }
    if ((await contributionModeFor(store, slug)) !== 'review') {
      return { ok: false, reason: 'contributions_off' };
    }
  }
  // Platform-owned games have no creator to opt in, so the platform's own switch is the
  // setting: absent means open. Turning it off for a specific catalog game is how a game
  // that should not be changed (a tutorial, a benchmark) is taken off the table.
  else if ((await store.getContributionSettings(slug))?.mode === 'off') {
    return { ok: false, reason: 'contributions_off' };
  }

  const publication = await store.getPublication(slug);
  // Repo-lane games have no publication record and are still perfectly proposable; what
  // is refused is a game that is not *live*, whichever lane it is in.
  if (publication && !isPublished(publication)) {
    return { ok: false, reason: 'not_published' };
  }

  const mine = await store.listProposals({ proposerUid });
  const open = mine.filter((record) => countsAsOpen(record.state));
  if (open.filter((record) => record.targetSlug === slug).length >= MAX_OPEN_PROPOSALS_PER_TARGET) {
    return { ok: false, reason: 'too_many_open_here' };
  }
  if (open.length >= MAX_OPEN_PROPOSALS_PER_PROPOSER) {
    return { ok: false, reason: 'too_many_open' };
  }

  return { ok: true, owner };
}

function stamp(record: ProposalRecord, to: ProposalState, by: ProposalActor, at: string, reason?: string): void {
  record.state = to;
  record.stateSince = at;
  record.updatedAt = at;
  record.transitions = [...record.transitions, { to, at, by, ...(reason ? { reason } : {}) }].slice(
    -MAX_PROPOSAL_TRANSITIONS,
  );
}

/**
 * Move a proposal, refusing illegal hops rather than trusting the caller.
 *
 * Returns false instead of throwing because every caller has a sensible response to "that
 * is not a legal move" — usually a 409 — and because the sweeps run against records they
 * read a moment ago, so losing a race is ordinary rather than exceptional.
 */
export function transitionProposal(
  record: ProposalRecord,
  to: ProposalState,
  by: ProposalActor,
  at: string,
  reason?: string,
): boolean {
  if (!canTransitionProposal(record.state, to)) return false;
  stamp(record, to, by, at, reason);
  return true;
}

export interface OpenProposalInput {
  targetSlug: string;
  proposerUid: string;
  title: string;
  description: string;
  base: ProposalBase;
  /** The complete source set of the proposed game — base files with the change applied. */
  files: SourceFile[];
}

export type OpenProposalResult =
  { ok: true; proposal: ProposalRecord } | { ok: false; status: number; error: string; category?: string };

/**
 * Open a proposal: moderate the words, write the version, and hand it to the gate.
 *
 * The ordering mirrors `createGame` and for the same reasons — eligibility before
 * moderation because moderation is a paid call, moderation before storage because a
 * refused proposal should leave nothing behind, and the gate last because it is the only
 * step that can be retried without side effects.
 */
export async function openProposal(deps: ProposalDeps, input: OpenProposalInput): Promise<OpenProposalResult> {
  const now = deps.now ?? Date.now;
  const at = new Date(now()).toISOString();

  const eligible = await canProposeTo(deps.store, input.targetSlug, input.proposerUid);
  if (!eligible.ok) {
    // 409 rather than 403: every one of these is a state of the world the caller can do
    // something about (wait, resolve another proposal, ask the owner), not a claim about
    // who they are.
    return { ok: false, status: 409, error: eligible.reason };
  }

  const title = sanitizeCreatorText(input.title, { singleLine: true }).slice(0, MAX_PROPOSAL_TITLE_LENGTH);
  const description = sanitizeCreatorText(input.description, { singleLine: false }).slice(
    0,
    MAX_PROPOSAL_DESCRIPTION_LENGTH,
  );
  if (title.length < 3) return { ok: false, status: 400, error: 'title_too_short' };
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
      });
      return { ok: false, status: 422, error: 'content_rejected', category: verdict.category ?? 'other' };
    }
  }

  if (input.files.length === 0) return { ok: false, status: 409, error: 'no_changes' };

  const id = randomUUID();
  const { version } = await deps.gamesStore.putCandidateSources({
    slug: input.targetSlug,
    issueNumber: PROPOSAL_NO_JOB,
    files: input.files,
    mode: 'proposal',
    proposal: { id, proposerUid: input.proposerUid },
  });

  const record: ProposalRecord = {
    id,
    targetSlug: input.targetSlug,
    targetOwnerUid: ownerUidOf(eligible.owner),
    proposerUid: input.proposerUid,
    base: input.base,
    version,
    state: 'submitted',
    stateSince: at,
    transitions: [{ to: 'submitted', at, by: 'proposer', reason: 'opened' }],
    title,
    description,
    thread: [],
    createdAt: at,
    updatedAt: at,
  };
  await deps.store.putProposal(record);
  return { ok: true, proposal: record };
}

/**
 * Read the gate's verdict off the manifest and move the proposal accordingly.
 *
 * Read rather than pushed, and read from the manifest rather than from anything the gate
 * told us, for the same reason job gate reconciliation does it: the manifest is what the
 * gate actually wrote, and it is the artifact the reviewer will be looking at.
 *
 * A red verdict goes to `needs_work`, which is invisible to the reviewer. That is the
 * anti-abuse property doing its job — a change that does not run never becomes somebody
 * else's problem.
 */
export async function reconcileProposalGate(deps: ProposalDeps, id: string): Promise<ProposalRecord | null> {
  const now = deps.now ?? Date.now;
  const record = await deps.store.getProposal(id);
  if (!record?.version) return null;
  if (record.state !== 'submitted' && record.state !== 'gating') return record;

  const manifest = await deps.gamesStore.getManifest(record.targetSlug, record.version);
  const verdict = manifest?.gate;
  if (!verdict) return record;

  const at = new Date(now()).toISOString();
  record.gate = {
    green: verdict.green,
    ranAt: verdict.ranAt,
    ...(verdict.report ? { report: verdict.report } : {}),
    ...(verdict.screenshot ? { screenshot: verdict.screenshot } : {}),
  };
  // A behavioural-golden change is a finding for the reviewer, never an automatic
  // refusal: a proposal that changes how the game plays is supposed to change the golden,
  // and refusing it would refuse the entire category of change worth proposing. Read off
  // the verdict the proposal gate set rather than sniffed out of the report text — the
  // report is a build log and its wording is not a contract.
  if (verdict.behaviouralDiff) record.behaviouralDiff = true;

  transitionProposal(
    record,
    verdict.green ? 'in_review' : 'needs_work',
    'gate',
    at,
    verdict.green ? 'gate_green' : 'gate_red',
  );
  await deps.store.putProposal(record);

  // The reviewer is told only now, on green — which is the same boundary
  // `isReviewerVisible` draws. A red proposal never becomes somebody else's problem, and
  // that includes never becoming a notification.
  if (verdict.green && record.targetOwnerUid) {
    await tell(deps, {
      uid: record.targetOwnerUid,
      type: 'proposal.awaiting_review',
      proposalId: record.id,
      gameTitle: record.targetSlug,
    });
  }
  return record;
}

export type DecisionResult =
  { ok: true; proposal: ProposalRecord } | { ok: false; status: number; error: string; category?: string };

/**
 * Accept a proposal: adopt its version and hand the owner a job they can publish.
 *
 * This is the step people expect to be "the merge", and the most important thing about it
 * is what it does not do. It does not publish. It flips the stored version out of proposal
 * mode, creates an improvement job owned by the target's owner with that version already
 * delivered and already gate-green, and stops. The owner then publishes it through the
 * same route as any other finished round — which is where the human moderation boundary
 * lives, and it stays exactly where it was.
 */
export async function acceptProposal(
  deps: ProposalDeps & {
    /** Creates the owner-side improvement job. Injected to keep submissions out of here. */
    adoptIntoJob: (input: {
      proposal: ProposalRecord;
      ownerUid: string | null;
    }) => Promise<{ issueNumber: number } | null>;
    /**
     * Lands an accepted **repo-lane** proposal in the games repo as a pull request.
     *
     * Injected rather than imported so this module keeps no GitHub dependency. Absent in
     * deployments with no games-repo credentials, which is not an error: the proposal is
     * still accepted, it simply has no PR yet and can be applied later.
     */
    applyToRepo?: (proposal: ProposalRecord) => Promise<{ number: number; url: string } | null>;
    /** The live snapshot pointer, for re-checking a repo-lane base at decision time. */
    snapshotPointer?: () => Promise<{ commitSha: string | null } | null>;
  },
  input: { id: string; byUid: string | null; reviewer: 'platform' | 'creator' },
): Promise<DecisionResult> {
  const now = deps.now ?? Date.now;
  const record = await deps.store.getProposal(input.id);
  if (!record) return { ok: false, status: 404, error: 'not_found' };
  if (!record.version) return { ok: false, status: 409, error: 'nothing_delivered' };
  if (record.state !== 'in_review') return { ok: false, status: 409, error: 'not_reviewable' };

  // Re-check staleness at the moment of the decision. The sweep runs on publish, but a
  // publish that lands between the reviewer opening the card and pressing accept would
  // otherwise adopt a change built on a base that is no longer live.
  const publication = await deps.store.getPublication(record.targetSlug);
  const stale =
    record.base.kind === 'store'
      ? isBaseStale(record.base.version, publication?.currentVersion)
      : // The repo lane's twin: a bake that landed between the reviewer opening the card
        // and pressing accept moves the commit the site serves, and a diff built on the
        // old one no longer describes a change to what anybody is playing.
        isRepoBaseStale(record.base, deps.snapshotPointer ? await deps.snapshotPointer() : null);
  if (stale) {
    const at = new Date(now()).toISOString();
    transitionProposal(record, 'superseded', 'system', at, 'stale_base');
    await deps.store.putProposal(record);
    return { ok: false, status: 409, error: 'superseded' };
  }

  // The version leaves proposal mode either way: it has been accepted, and the manifest is
  // where that fact lives. What differs by lane is where it goes next.
  await deps.gamesStore.adoptProposalVersion({
    slug: record.targetSlug,
    version: record.version,
    proposalId: record.id,
    byUid: input.byUid,
  });

  const at = new Date(now()).toISOString();

  if (record.base.kind === 'repo') {
    /*
     * Repo lane. The games repo is still the system of record for these games and wins
     * catalog ties, so an accepted change has to become a commit there or the site keeps
     * serving the old game whatever this record says. The apply bot opens the PR;
     * `validate.yml`, CODEOWNERS and the bake finish the job exactly as they would for a
     * maintainer's own commit.
     *
     * No job is created: a repo-lane game has no store publication for one to deliver
     * into, and inventing one would put a job on somebody's shelf for a game they do not
     * own in the store sense.
     */
    const pr = deps.applyToRepo ? await deps.applyToRepo(record) : null;
    if (pr) record.mergePr = { number: pr.number, url: pr.url, openedAt: at };
  } else {
    const job = await deps.adoptIntoJob({ proposal: record, ownerUid: input.byUid });
    if (job) record.adoptedJobId = job.issueNumber;
  }

  record.decision = { at, byUid: input.byUid, reviewer: input.reviewer };
  transitionProposal(record, 'accepted', input.reviewer === 'platform' ? 'operator' : 'reviewer', at, 'accepted');
  await deps.store.putProposal(record);
  await tell(deps, {
    uid: record.proposerUid,
    type: 'proposal.decided',
    proposalId: record.id,
    gameTitle: record.targetSlug,
  });
  return { ok: true, proposal: record };
}

/**
 * Move repo-lane proposals to `merged` once their PR has landed and the bake republished.
 *
 * The store lane learns this from the publication registry (`markProposalsMerged`); the
 * repo lane has to learn it from the repo, because nothing in our own state changes when
 * a games-repo PR merges. Called by the snapshot-publish path, which is the moment the new
 * commit is actually being served — not when the PR merged, which is a promise the site
 * has not yet kept.
 */
export async function markRepoProposalsMerged(
  deps: ProposalDeps & { isPullRequestMerged: (number: number) => Promise<boolean> },
  input: { slug?: string },
): Promise<ProposalRecord[]> {
  const now = deps.now ?? Date.now;
  const at = new Date(now()).toISOString();
  const accepted = await deps.store.listProposals({
    state: ['accepted'],
    ...(input.slug ? { targetSlug: input.slug } : {}),
  });
  const merged: ProposalRecord[] = [];
  for (const record of accepted) {
    if (record.base.kind !== 'repo' || !record.mergePr || record.mergePr.mergedAt) continue;
    if (!(await deps.isPullRequestMerged(record.mergePr.number))) continue;
    record.mergePr = { ...record.mergePr, mergedAt: at };
    if (!transitionProposal(record, 'merged', 'system', at, 'repo_merged')) continue;
    await deps.store.putProposal(record);
    await tell(deps, {
      uid: record.proposerUid,
      type: 'proposal.merged',
      proposalId: record.id,
      gameTitle: record.targetSlug,
    });
    merged.push(record);
  }
  return merged;
}

/** Decline a proposal, recording whether the refusal is reportable. */
export async function declineProposal(
  deps: ProposalDeps,
  input: {
    id: string;
    byUid: string | null;
    reviewer: 'platform' | 'creator';
    reason: DeclineReason;
    note?: string;
  },
): Promise<DecisionResult> {
  const now = deps.now ?? Date.now;
  const record = await deps.store.getProposal(input.id);
  if (!record) return { ok: false, status: 404, error: 'not_found' };
  if (!isReviewerVisible(record.state)) return { ok: false, status: 409, error: 'not_reviewable' };

  const note = input.note
    ? sanitizeCreatorText(input.note, { singleLine: false }).slice(0, MAX_PROPOSAL_MESSAGE_LENGTH)
    : undefined;
  if (note && deps.contentChecker) {
    const verdict = await deps.contentChecker.checkFields([note]);
    if (!verdict.allowed) {
      logModerationRejection(deps.log ?? SILENT_LOG, {
        surface: 'proposal',
        uid: input.byUid ?? undefined,
        category: verdict.category,
      });
      return { ok: false, status: 422, error: 'content_rejected', category: verdict.category ?? 'other' };
    }
  }

  const at = new Date(now()).toISOString();
  record.decision = {
    at,
    byUid: input.byUid,
    reviewer: input.reviewer,
    reason: input.reason,
    ...(note ? { note } : {}),
    // Stamped here rather than by whoever sends the notification, so the obligation is
    // recorded even if delivery fails and has to be retried.
    ...(owesStatementOfReasons({ reviewer: input.reviewer, reason: input.reason }) ? { statementSentAt: at } : {}),
  };
  if (
    !transitionProposal(record, 'declined', input.reviewer === 'platform' ? 'operator' : 'reviewer', at, input.reason)
  ) {
    return { ok: false, status: 409, error: 'not_reviewable' };
  }
  await deps.store.putProposal(record);
  return { ok: true, proposal: record };
}

/** Ask the proposer for something specific, and hand the proposal back to them. */
export async function requestProposalChanges(
  deps: ProposalDeps,
  input: { id: string; byUid: string | null; reviewer: 'platform' | 'creator'; text: string },
): Promise<DecisionResult> {
  const now = deps.now ?? Date.now;
  const record = await deps.store.getProposal(input.id);
  if (!record) return { ok: false, status: 404, error: 'not_found' };
  if (record.state !== 'in_review') return { ok: false, status: 409, error: 'not_reviewable' };

  const text = sanitizeCreatorText(input.text, { singleLine: false }).slice(0, MAX_PROPOSAL_MESSAGE_LENGTH);
  if (text.length < 2) return { ok: false, status: 400, error: 'text_too_short' };
  if (deps.contentChecker) {
    const verdict = await deps.contentChecker.checkFields([text]);
    if (!verdict.allowed) {
      logModerationRejection(deps.log ?? SILENT_LOG, {
        surface: 'proposal',
        uid: input.byUid ?? undefined,
        category: verdict.category,
      });
      return { ok: false, status: 422, error: 'content_rejected', category: verdict.category ?? 'other' };
    }
  }

  const at = new Date(now()).toISOString();
  const message: ProposalMessage = { id: randomUUID(), from: 'reviewer', text, createdAt: at };
  record.thread = [...record.thread, message].slice(-MAX_PROPOSAL_MESSAGES);
  transitionProposal(
    record,
    'changes_requested',
    input.reviewer === 'platform' ? 'operator' : 'reviewer',
    at,
    'changes_requested',
  );
  await deps.store.putProposal(record);
  await tell(deps, {
    uid: record.proposerUid,
    type: 'proposal.decided',
    proposalId: record.id,
    gameTitle: record.targetSlug,
  });
  return { ok: true, proposal: record };
}

/** The proposer takes it back. Legal from any live state — it is their change. */
export async function withdrawProposal(
  deps: ProposalDeps,
  input: { id: string; uid: string },
): Promise<DecisionResult> {
  const now = deps.now ?? Date.now;
  const record = await deps.store.getProposal(input.id);
  if (!record) return { ok: false, status: 404, error: 'not_found' };
  if (record.proposerUid !== input.uid) return { ok: false, status: 404, error: 'not_found' };

  const at = new Date(now()).toISOString();
  if (!transitionProposal(record, 'withdrawn', 'proposer', at, 'withdrawn')) {
    return { ok: false, status: 409, error: 'already_decided' };
  }
  await deps.store.putProposal(record);
  return { ok: true, proposal: record };
}

/**
 * Mark every live proposal against `slug` superseded, because the game just published
 * something else.
 *
 * Runs on publish rather than on a timer: the moment a new version goes live is exactly
 * the moment every proposal built on the previous one stops describing an applicable
 * change, and finding out later means a reviewer can accept a diff that no longer applies.
 *
 * `exceptProposalId` spares the proposal that *caused* this publish — accepting a proposal
 * publishes a new version, and superseding it in the same breath would mark the winner
 * stale. That one goes to `merged` instead, via {@link markProposalsMerged}.
 */
export async function supersedeStaleProposals(
  deps: ProposalDeps,
  input: { slug: string; currentVersion?: string; exceptProposalId?: string },
): Promise<number> {
  const now = deps.now ?? Date.now;
  const at = new Date(now()).toISOString();
  const open = await deps.store.listProposals({ targetSlug: input.slug });
  let superseded = 0;
  for (const record of open) {
    if (!countsAsOpen(record.state)) continue;
    if (record.id === input.exceptProposalId) continue;
    if (record.base.kind === 'store' && !isBaseStale(record.base.version, input.currentVersion)) continue;
    if (!transitionProposal(record, 'superseded', 'system', at, 'target_published')) continue;
    await deps.store.putProposal(record);
    superseded += 1;
  }
  return superseded;
}

/** Move accepted proposals to `merged` once the version they were adopted into went live. */
export async function markProposalsMerged(
  deps: ProposalDeps,
  input: { slug: string; version: string },
): Promise<ProposalRecord[]> {
  const now = deps.now ?? Date.now;
  const at = new Date(now()).toISOString();
  const candidates = await deps.store.listProposals({ targetSlug: input.slug, state: ['accepted'] });
  const merged: ProposalRecord[] = [];
  for (const record of candidates) {
    if (record.version !== input.version) continue;
    if (!transitionProposal(record, 'merged', 'system', at, 'published')) continue;
    await deps.store.putProposal(record);
    // The watcher relationship starts here: a merged contributor gets digest visibility,
    // never approval rights (the rule the improvement-loop plan already settled).
    await tell(deps, {
      uid: record.proposerUid,
      type: 'proposal.merged',
      proposalId: record.id,
      gameTitle: record.targetSlug,
    });
    merged.push(record);
  }
  return merged;
}

/**
 * Expire proposals nobody reviewed.
 *
 * Deliberately not a decline. A creator who stopped building has not rejected anything,
 * and a queue that grows forever against inactive creators eventually forces either bad
 * reviews or an exit. The proposer is told the game went quiet.
 */
export async function expireStaleProposals(deps: ProposalDeps, opts?: { limit?: number }): Promise<ProposalRecord[]> {
  const now = deps.now ?? Date.now;
  const at = now();
  const cutoff = at - PROPOSAL_EXPIRY_MS;
  const waiting = await deps.store.listProposals({ state: ['in_review', 'changes_requested'], limit: opts?.limit });
  const expired: ProposalRecord[] = [];
  for (const record of waiting) {
    if (Date.parse(record.stateSince) > cutoff) continue;
    if (!transitionProposal(record, 'expired', 'system', new Date(at).toISOString(), 'owner_silent')) continue;
    await deps.store.putProposal(record);
    // Told as a decision, because to the proposer it is one — but the copy says the game
    // went quiet, not that they were turned down.
    await tell(deps, {
      uid: record.proposerUid,
      type: 'proposal.decided',
      proposalId: record.id,
      gameTitle: record.targetSlug,
    });
    expired.push(record);
  }
  return expired;
}

/** Whether this record should be visible to `uid` as a reviewer. */
export function visibleToReviewer(record: ProposalRecord, uid: string | null, isOperator: boolean): boolean {
  if (!isReviewerVisible(record.state)) return false;
  if (record.targetOwnerUid === null) return isOperator;
  return record.targetOwnerUid === uid;
}

/** Re-export so route and sweep callers need one import for the reviewer-kind vocabulary. */
export { reviewerKindOf };
