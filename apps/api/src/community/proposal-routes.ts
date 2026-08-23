// HTTP for proposals.
//
// Three audiences share one collection, and the routes are grouped by which of them is
// asking rather than by verb:
//
//   /api/proposals              the proposer — what have I sent, and what happened to it
//   /api/me/reviews             the creator — what is waiting on me, and my decision
//   /api/admin/proposals        the operator — the same, for platform-owned games
//
// The split matters because the same record means different things from each seat, and
// collapsing them into one resource with a role flag is how a creator ends up able to read
// somebody else's queue by changing a query parameter. Here, each route resolves its own
// authority and filters on the way out of the store rather than on the way into the view.
//
// Nothing here decides policy. Eligibility, transitions, and the statement-of-reasons rule
// all live in `proposals.ts` / `proposal-state.ts`; this module validates input, resolves
// who is asking, and maps refusals onto status codes.

import { CONTRIBUTION_MODES, type ContributionMode } from '@gamedevpl/contract';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isAdminSession } from '../admin-session.js';
import type { GamesStore, SourceFile } from '../games-store.js';
import { diffProposal } from './proposal-diff.js';
import type { ContentChecker } from '../moderation.js';
import { resolveOwnerOfRecord } from '../owner-of-record.js';
import { DECLINE_REASONS, toPublicProposalState, type DeclineReason } from './proposal-state.js';
import {
  acceptProposal,
  canProposeTo,
  declineProposal,
  requestProposalChanges,
  visibleToReviewer,
  withdrawProposal,
  MAX_PROPOSAL_DESCRIPTION_LENGTH,
  MAX_PROPOSAL_MESSAGE_LENGTH,
  MAX_PROPOSAL_TITLE_LENGTH,
  MIN_PROPOSAL_DESCRIPTION_LENGTH,
  type ProposalDeps,
} from './proposals.js';
import type { ProposalRecord, Store } from '../store.js';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const SlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
});

const IdParamsSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

const DeclineSchema = z.object({
  reason: z.enum(DECLINE_REASONS),
  note: z.string().trim().max(MAX_PROPOSAL_MESSAGE_LENGTH).optional(),
});

const ChangesSchema = z.object({
  text: z.string().trim().min(2).max(MAX_PROPOSAL_MESSAGE_LENGTH),
});

const ContributionSchema = z.object({
  mode: z.enum(CONTRIBUTION_MODES),
});

const BlockSchema = z.object({
  uid: z.string().trim().min(1).max(128),
});

export interface ProposalRoutesOptions {
  store: Store;
  gamesStore?: GamesStore | null;
  /** Resolves a proposal's base sources, for the diff. Both lanes. */
  resolveBase?: (slug: string) => Promise<{ files: SourceFile[] } | null>;
  /** Lands an accepted repo-lane proposal in the games repo. */
  applyToRepo?: (proposal: ProposalRecord) => Promise<{ number: number; url: string } | null>;
  /** The live snapshot pointer, for re-checking a repo-lane base at decision time. */
  snapshotPointer?: () => Promise<{ commitSha: string | null } | null>;
  /** Tells somebody a proposal moved. Best effort — see ProposalDeps.notify. */
  notify?: ProposalDeps['notify'];
  contentChecker?: ContentChecker;
  adminUids?: Set<string>;
  /**
   * Creates the owner-side job that carries an accepted proposal's version.
   *
   * Injected rather than imported so this module does not depend on the submissions
   * registrar, which is where job creation and dispatch live. Returns null when the job
   * could not be created, which the caller reports rather than swallowing — an accepted
   * proposal with no job is a change the owner cannot publish.
   */
  adoptIntoJob?: (input: {
    proposal: ProposalRecord;
    ownerUid: string | null;
  }) => Promise<{ issueNumber: number } | null>;
  now?: () => number;
}

/** Guard shared by every signed-in route here. Mirrors `checkUserAccess` in submissions. */
function requireUser(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!request.user) {
    reply.status(401).send({ error: 'authentication required' });
    return false;
  }
  if (request.user.tier === 'blocked') {
    reply.status(403).send({ error: 'account is blocked' });
    return false;
  }
  return true;
}

/**
 * What a proposal looks like from outside.
 *
 * Both seats get the same shape, and neither gets the raw record: `transitions` is
 * internal bookkeeping, and the gate `report` is a build log that can run to megabytes and
 * name our infrastructure. The reviewer's card shows the verdict and the screenshot; the
 * proposer's tracker shows the same, plus whatever the reviewer wrote to them.
 */
function toPublicProposal(record: ProposalRecord) {
  return {
    id: record.id,
    targetSlug: record.targetSlug,
    proposerUid: record.proposerUid,
    state: toPublicProposalState(record.state),
    title: record.title,
    description: record.description,
    base: record.base,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    gate: record.gate
      ? { green: record.gate.green, ranAt: record.gate.ranAt, screenshot: record.gate.screenshot }
      : undefined,
    behaviouralDiff: record.behaviouralDiff,
    thread: record.thread,
    decision: record.decision
      ? { at: record.decision.at, reason: record.decision.reason, note: record.decision.note }
      : undefined,
    platformOwned: record.targetOwnerUid === null,
  };
}

export async function registerProposalRoutes(app: FastifyInstance, options: ProposalRoutesOptions): Promise<void> {
  const { store, contentChecker, adminUids } = options;
  const now = options.now ?? Date.now;
  const gamesStore = options.gamesStore ?? null;

  /** Assembled per request so a deployment without a games store degrades rather than crashes. */
  function deps(log?: ProposalDeps['log']): ProposalDeps | null {
    if (!gamesStore) return null;
    return { store, gamesStore, contentChecker, log, notify: options.notify, now };
  }

  /**
   * Whether this game takes proposals from this caller — the read behind Remix's
   * "Propose this change" button.
   *
   * Answers with a reason rather than a bare boolean so the client can say why the door is
   * shut. `blocked` is deliberately *not* distinguished from `contributions_off` in the
   * response: telling someone they have been blocked by a specific creator turns a private
   * boundary into a notification, and the honest alternative — silence — is worse.
   */
  app.get<{ Params: { slug: string } }>('/api/games/:slug/contributions', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'invalid slug' });

    const verdict = await canProposeTo(store, params.data.slug, request.user!.uid);
    if (verdict.ok) return reply.send({ canPropose: true });
    const reason = verdict.reason === 'blocked' ? 'contributions_off' : verdict.reason;
    return reply.send({ canPropose: false, reason });
  });

  /** The proposer's tracker. Only ever their own. */
  app.get('/api/proposals', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const records = await store.listProposals({ proposerUid: request.user!.uid });
    return reply.send({ proposals: records.map(toPublicProposal) });
  });

  app.get<{ Params: { id: string } }>('/api/proposals/:id', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'not_found' });

    const record = await store.getProposal(params.data.id);
    if (!record) return reply.status(404).send({ error: 'not_found' });

    // One route, three legitimate readers. Anyone else gets 404 rather than 403: a
    // proposal's existence is not public, and confirming it would let someone enumerate
    // what is pending against a game they do not own.
    const uid = request.user!.uid;
    const operator = isAdminSession(request, adminUids);
    if (record.proposerUid !== uid && !visibleToReviewer(record, uid, operator)) {
      return reply.status(404).send({ error: 'not_found' });
    }
    return reply.send({ proposal: toPublicProposal(record) });
  });

  /**
   * What this proposal changes, file by file.
   *
   * Same readership as the proposal itself — author, reviewer, operator — because a
   * proposer looking at their own rejected diff is as legitimate a reader as the person
   * who rejected it. Computed on demand rather than stored: the version and its base are
   * both immutable, so the diff is a pure function of two things that cannot drift, and a
   * second stored representation could only ever disagree with them.
   */
  app.get<{ Params: { id: string } }>('/api/proposals/:id/diff', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(404).send({ error: 'not_found' });
    if (!gamesStore || !options.resolveBase) return reply.status(503).send({ error: 'store_unavailable' });

    const record = await store.getProposal(params.data.id);
    if (!record?.version) return reply.status(404).send({ error: 'not_found' });
    const uid = request.user!.uid;
    if (record.proposerUid !== uid && !visibleToReviewer(record, uid, isAdminSession(request, adminUids))) {
      return reply.status(404).send({ error: 'not_found' });
    }

    const manifest = await gamesStore.getManifest(record.targetSlug, record.version);
    if (!manifest) return reply.status(404).send({ error: 'not_found' });
    const proposed: SourceFile[] = [];
    for (const path of manifest.sourceFiles) {
      const content = await gamesStore.getSourceFile(record.targetSlug, record.version, path);
      if (content !== null) proposed.push({ path, content });
    }

    const base = await options.resolveBase(record.targetSlug);
    return reply.send({ diff: diffProposal(base?.files ?? [], proposed) });
  });

  app.post<{ Params: { id: string } }>('/api/proposals/:id/withdraw', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const scope = deps(request.log);
    if (!scope) return reply.status(503).send({ error: 'store_unavailable' });
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(404).send({ error: 'not_found' });

    const result = await withdrawProposal(scope, { id: params.data.id, uid: request.user!.uid });
    if (!result.ok) return reply.status(result.status).send({ error: result.error });
    return reply.send({ proposal: toPublicProposal(result.proposal) });
  });

  /** The creator's review queue: proposals against games they own. */
  app.get('/api/me/reviews', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const records = await store.listProposals({ targetOwnerUid: request.user!.uid });
    const visible = records.filter((record) => visibleToReviewer(record, request.user!.uid, false));
    return reply.send({ proposals: visible.map(toPublicProposal) });
  });

  /** The operator's queue: proposals against platform-owned games. */
  app.get('/api/admin/proposals', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) return reply.code(404).send({ error: 'not_found' });
    const records = await store.listProposals({ targetOwnerUid: null });
    const visible = records.filter((record) => visibleToReviewer(record, null, true));
    return reply.send({ proposals: visible.map(toPublicProposal) });
  });

  /**
   * Resolve who is deciding, and refuse if it is not this caller's to decide.
   *
   * Returns the reviewer kind because the statement-of-reasons rule turns on it, and
   * because getting it from the record rather than from the request is what stops an
   * operator's decline on a creator's game from being recorded as a platform act.
   */
  async function resolveReviewer(
    request: FastifyRequest,
    record: ProposalRecord,
  ): Promise<{ ok: true; reviewer: 'platform' | 'creator'; byUid: string | null } | { ok: false }> {
    if (record.targetOwnerUid === null) {
      if (!isAdminSession(request, adminUids)) return { ok: false };
      return { ok: true, reviewer: 'platform', byUid: request.user?.uid ?? null };
    }
    if (!request.user || record.targetOwnerUid !== request.user.uid) return { ok: false };
    // Re-resolved rather than trusted from the denormalised field: a slug that changed
    // hands between opening and deciding must route to whoever holds it now.
    const owner = await resolveOwnerOfRecord(store, record.targetSlug);
    if (owner.kind !== 'creator' || owner.uid !== request.user.uid) return { ok: false };
    return { ok: true, reviewer: 'creator', byUid: request.user.uid };
  }

  app.post<{ Params: { id: string } }>('/api/proposals/:id/accept', async (request, reply) => {
    if (!request.user && !isAdminSession(request, adminUids)) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const scope = deps(request.log);
    if (!scope) return reply.status(503).send({ error: 'store_unavailable' });
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(404).send({ error: 'not_found' });

    const record = await store.getProposal(params.data.id);
    if (!record) return reply.status(404).send({ error: 'not_found' });
    const reviewer = await resolveReviewer(request, record);
    if (!reviewer.ok) return reply.status(404).send({ error: 'not_found' });

    const adoptIntoJob = options.adoptIntoJob;
    if (!adoptIntoJob) return reply.status(503).send({ error: 'store_unavailable' });

    const result = await acceptProposal(
      {
        ...scope,
        adoptIntoJob,
        ...(options.applyToRepo ? { applyToRepo: options.applyToRepo } : {}),
        ...(options.snapshotPointer ? { snapshotPointer: options.snapshotPointer } : {}),
      },
      { id: record.id, byUid: reviewer.byUid, reviewer: reviewer.reviewer },
    );
    if (!result.ok) return reply.status(result.status).send({ error: result.error });
    return reply.send({ proposal: toPublicProposal(result.proposal) });
  });

  app.post<{ Params: { id: string } }>('/api/proposals/:id/decline', async (request, reply) => {
    if (!request.user && !isAdminSession(request, adminUids)) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const scope = deps(request.log);
    if (!scope) return reply.status(503).send({ error: 'store_unavailable' });
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(404).send({ error: 'not_found' });
    const body = DeclineSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });

    const record = await store.getProposal(params.data.id);
    if (!record) return reply.status(404).send({ error: 'not_found' });
    const reviewer = await resolveReviewer(request, record);
    if (!reviewer.ok) return reply.status(404).send({ error: 'not_found' });

    const result = await declineProposal(scope, {
      id: record.id,
      byUid: reviewer.byUid,
      reviewer: reviewer.reviewer,
      reason: body.data.reason as DeclineReason,
      note: body.data.note,
    });
    if (!result.ok) {
      // The category comes from the domain layer, which also logged the rejection — see
      // ProposalDeps.log. Normalized at the send site like every other moderating route,
      // because JSON drops an undefined value and the client looks up
      // `errors.contentRejected.<category>`.
      if (result.error === 'content_rejected') {
        return reply.status(422).send({ error: 'content_rejected', category: result.category ?? 'other' });
      }
      return reply.status(result.status).send({ error: result.error });
    }
    return reply.send({ proposal: toPublicProposal(result.proposal) });
  });

  app.post<{ Params: { id: string } }>('/api/proposals/:id/changes', async (request, reply) => {
    if (!request.user && !isAdminSession(request, adminUids)) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const scope = deps(request.log);
    if (!scope) return reply.status(503).send({ error: 'store_unavailable' });
    const params = IdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(404).send({ error: 'not_found' });
    const body = ChangesSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });

    const record = await store.getProposal(params.data.id);
    if (!record) return reply.status(404).send({ error: 'not_found' });
    const reviewer = await resolveReviewer(request, record);
    if (!reviewer.ok) return reply.status(404).send({ error: 'not_found' });

    const result = await requestProposalChanges(scope, {
      id: record.id,
      byUid: reviewer.byUid,
      reviewer: reviewer.reviewer,
      text: body.data.text,
    });
    if (!result.ok) {
      // The category comes from the domain layer, which also logged the rejection — see
      // ProposalDeps.log. Normalized at the send site like every other moderating route,
      // because JSON drops an undefined value and the client looks up
      // `errors.contentRejected.<category>`.
      if (result.error === 'content_rejected') {
        return reply.status(422).send({ error: 'content_rejected', category: result.category ?? 'other' });
      }
      return reply.status(result.status).send({ error: result.error });
    }
    return reply.send({ proposal: toPublicProposal(result.proposal) });
  });

  /**
   * The contributions switch — the creator-veto question, answered once as one setting.
   *
   * Owner-only, and resolved through the same owner-of-record rule as everything else, so
   * a game that changed hands cannot be reopened to proposals by its previous owner.
   */
  app.put<{ Params: { slug: string } }>('/api/me/games/:slug/contributions', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
    const body = ContributionSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'invalid request' });

    const owner = await resolveOwnerOfRecord(store, params.data.slug);
    if (owner.kind !== 'creator' || owner.uid !== request.user!.uid) {
      return reply.status(404).send({ error: 'not_found' });
    }
    await store.putContributionSettings({
      slug: params.data.slug,
      mode: body.data.mode as ContributionMode,
      updatedAt: new Date(now()).toISOString(),
      updatedByUid: request.user!.uid,
    });
    return reply.send({ ok: true, mode: body.data.mode });
  });

  app.get<{ Params: { slug: string } }>('/api/me/games/:slug/contributions', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'invalid slug' });

    const owner = await resolveOwnerOfRecord(store, params.data.slug);
    if (owner.kind !== 'creator' || owner.uid !== request.user!.uid) {
      return reply.status(404).send({ error: 'not_found' });
    }
    const settings = await store.getContributionSettings(params.data.slug);
    return reply.send({ mode: settings?.mode ?? 'off' });
  });

  /** Blocks are per creator, not per game: a boundary is about a person. */
  app.get('/api/me/contributor-blocks', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const blocks = await store.listContributorBlocks(request.user!.uid);
    return reply.send({ blocks });
  });

  app.post('/api/me/contributor-blocks', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const body = BlockSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'invalid request' });
    if (body.data.uid === request.user!.uid) return reply.status(400).send({ error: 'invalid request' });

    await store.blockContributor({
      ownerUid: request.user!.uid,
      blockedUid: body.data.uid,
      createdAt: new Date(now()).toISOString(),
    });
    return reply.send({ ok: true });
  });

  app.delete<{ Params: { uid: string } }>('/api/me/contributor-blocks/:uid', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    await store.unblockContributor(request.user!.uid, request.params.uid);
    return reply.send({ ok: true });
  });
}

export const PROPOSAL_TEXT_LIMITS = {
  title: MAX_PROPOSAL_TITLE_LENGTH,
  descriptionMin: MIN_PROPOSAL_DESCRIPTION_LENGTH,
  descriptionMax: MAX_PROPOSAL_DESCRIPTION_LENGTH,
  message: MAX_PROPOSAL_MESSAGE_LENGTH,
};
