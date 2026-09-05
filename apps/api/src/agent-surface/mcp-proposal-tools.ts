import { looksLikeCreatorAgentKey } from './agent-creator-key.js';
import { verifyDurableCreatorAgentKey } from './agent-creator-key-resolve.js';
import { looksLikeAsAccessToken, verifyMcpAsAccessToken as verifyAsAccessToken } from '../platform/oauth-scopes.js';
import type { OpenProposalInput, OpenProposalResult, ProposalDeps, ProposalRefusal } from '../community/proposals.js';
import type { ProposalActor, ProposalPublicState, ProposalState } from '../community/proposal-state.js';
import type { OwnerOfRecord } from '../community/owner-of-record.js';
import { canSubmitProposal, MAX_PROPOSAL_SUBMITS, PROPOSAL_NO_JOB } from '../platform/proposal-limits.js';
import type { GamesStore, SourceFile } from '../delivery/games-store.js';
import { forbiddenIndexHtmlWriteReason } from '../platform/delivery-path-guard.js';
import type { ProposalRecord, Store, ProposalBase } from '../platform/store.js';

import type { ContentChecker } from '../platform/moderation.js';
import {
  toolOk,
  toolErr,
  PLATFORM_CONNECTOR_ONLY_REASON,
  matchesPlatformConnectorSecret,
  type ToolHandler,
} from './mcp-tool-support.js';

const READS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const WRITES_ONCE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

// N1: community owns the proposal state machine; these tools are handed it.
export interface ProposalDomain {
  canProposeTo: (
    store: Store,
    slug: string,
    proposerUid: string,
  ) => Promise<{ ok: true; owner: OwnerOfRecord } | { ok: false; reason: ProposalRefusal }>;
  openProposal: (deps: ProposalDeps, input: OpenProposalInput) => Promise<OpenProposalResult>;
  reconcileProposalGate: (deps: ProposalDeps, id: string) => Promise<ProposalRecord | null>;
  transitionProposal: (
    record: ProposalRecord,
    to: ProposalState,
    by: ProposalActor,
    at: string,
    reason?: string,
  ) => boolean;
  isProposerTurn: (state: ProposalState) => boolean;
  toPublicProposalState: (state: ProposalState) => ProposalPublicState;
}

export interface ProposalToolsDeps {
  store: Store | undefined;
  proposals: ProposalDomain;
  agentTokenSecret: string | undefined;
  platformConnectorSecret: string | undefined;
  now: () => number;
  missingCredentialHint: string;
  gamesStore: GamesStore | undefined;
  resolveProposalBase: ((slug: string) => Promise<{ base: ProposalBase; files: SourceFile[] } | null>) | undefined;
  contentChecker: ContentChecker | undefined;
  onSourcesDelivered:
    | ((input: { jobId: number; slug: string; version: string; mode?: 'health' | 'preview' | 'proposal' }) => unknown)
    | undefined;
}

export interface ProposalToolEntry {
  annotations: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

// A proposal has no job; the same credential repeats each call.
export function createProposalTools(deps: ProposalToolsDeps): Record<string, ProposalToolEntry> {
  const {
    store,
    agentTokenSecret,
    platformConnectorSecret,
    now,
    missingCredentialHint,
    gamesStore,
    resolveProposalBase,
    contentChecker,
    onSourcesDelivered,
  } = deps;
  const { canProposeTo, openProposal, reconcileProposalGate, transitionProposal } = deps.proposals;
  const { isProposerTurn, toPublicProposalState } = deps.proposals;

  // Who is calling, without asking whether they own anything the target game.
  async function resolveProposerUid(
    bearer: string | null | undefined,
  ): Promise<{ ok: true; uid: string } | { ok: false; reason: string }> {
    if (!store || !agentTokenSecret) return { ok: false, reason: 'the MCP endpoint is not configured' };
    if (!bearer) return { ok: false, reason: missingCredentialHint };
    if (matchesPlatformConnectorSecret(bearer, platformConnectorSecret)) {
      return { ok: false, reason: PLATFORM_CONNECTOR_ONLY_REASON };
    }

    if (looksLikeCreatorAgentKey(bearer)) {
      const verified = await verifyDurableCreatorAgentKey(store, bearer, agentTokenSecret, now());
      if (!verified.ok) return { ok: false, reason: verified.reason };
      return { ok: true, uid: verified.claims.creatorUid };
    }

    if (looksLikeAsAccessToken(bearer)) {
      const asAccess = await verifyAsAccessToken(store, bearer, now());
      if (!asAccess) return { ok: false, reason: 'invalid OAuth access — sign in again from your coding agent' };
      return { ok: true, uid: asAccess.ownerUid };
    }

    return { ok: false, reason: missingCredentialHint };
  }

  // Turns a refusal code into something actionable, not just a retry.
  function proposalRefusalHint(reason: string): string {
    switch (reason) {
      case 'contributions_off':
        return 'this game is not accepting proposals';
      case 'own_game':
        return 'this is your own game — use open_round instead';
      case 'not_published':
        return 'this game is not published right now';
      case 'too_many_open_here':
        return 'you already have the maximum open proposals for this game — resolve one first';
      case 'too_many_open':
        return 'you have too many open proposals — resolve some before opening more';
      case 'blocked':
        // Naming who blocked whom would leak a private boundary.
        return 'this game is not accepting proposals';
      default:
        return reason;
    }
  }

  return {
    open_proposal_round: {
      annotations: { title: "Propose a change to another creator's game", ...WRITES_ONCE },
      outputSchema: {
        type: 'object',
        properties: {
          proposalId: { type: 'string' },
          slug: { type: 'string' },
          files: {
            type: 'array',
            description: "The target game's published sources — the base your change applies to.",
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, content: { type: 'string' } },
              required: ['path', 'content'],
            },
          },
        },
        required: ['proposalId', 'slug', 'files'],
      },
      description:
        "Open a proposal against a published game you do NOT own. Returns the game's current " +
        'sources to work from and a proposalId. Nothing is sent until you call submit_proposal. ' +
        'The game must have contributions enabled; the owner reviews and may decline.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Slug of the game you want to change.' },
          title: { type: 'string', description: 'Short title for the change (≤120 chars).' },
          description: {
            type: 'string',
            description: 'What you changed and why (20–2000 chars). Untrusted text; shown to the owner as data.',
          },
        },
        required: ['slug', 'title', 'description'],
      },
      handler: async (args, ctx) => {
        if (!store || !gamesStore || !resolveProposalBase) {
          return toolErr('proposal rounds are not configured on this deployment');
        }
        const proposer = await resolveProposerUid(ctx.bearerToken);
        if (!proposer.ok) return toolErr(proposer.reason);

        const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
        const title = typeof args.title === 'string' ? args.title.trim() : '';
        const description = typeof args.description === 'string' ? args.description.trim() : '';
        if (!slug) return toolErr('slug is required');

        // Checked before the fetch: a repo-lane base is a tarball download.
        const eligible = await canProposeTo(store, slug, proposer.uid);
        if (!eligible.ok) return toolErr(proposalRefusalHint(eligible.reason));

        const resolvedBase = await resolveProposalBase(slug);
        if (!resolvedBase) return toolErr("could not read that game's sources");

        const opened = await openProposal(
          {
            store,
            gamesStore,
            contentChecker,
            log: ctx.request.log,
            now,
          },
          {
            targetSlug: slug,
            proposerUid: proposer.uid,
            title,
            description,
            base: resolvedBase.base,
            // Opened with the base itself, so the round exists as a draft.
            files: resolvedBase.files,
          },
        );
        if (!opened.ok) {
          return toolErr(opened.error === 'content_rejected' ? 'content_rejected' : proposalRefusalHint(opened.error), {
            ...(opened.category ? { category: opened.category } : {}),
          });
        }

        return toolOk({
          proposalId: opened.proposal.id,
          slug,
          files: resolvedBase.files,
        });
      },
    },

    submit_proposal: {
      annotations: { title: 'Send a proposal for review', ...WRITES_ONCE },
      outputSchema: {
        type: 'object',
        properties: { proposalId: { type: 'string' }, state: { type: 'string' } },
        required: ['proposalId', 'state'],
      },
      description:
        'Send your changed sources for the proposal you opened. Send the COMPLETE file set, ' +
        "not a patch. We run the same gate a creator's own delivery gets; poll " +
        'get_proposal_status until it leaves "checking". A red gate comes back to you and the ' +
        'owner never sees it.',
      inputSchema: {
        type: 'object',
        properties: {
          proposalId: { type: 'string' },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, content: { type: 'string' } },
              required: ['path', 'content'],
            },
          },
        },
        required: ['proposalId', 'files'],
      },
      handler: async (args, ctx) => {
        if (!store || !gamesStore) {
          return toolErr('proposal rounds are not configured on this deployment');
        }
        const proposer = await resolveProposerUid(ctx.bearerToken);
        if (!proposer.ok) return toolErr(proposer.reason);

        const proposalId = typeof args.proposalId === 'string' ? args.proposalId.trim() : '';
        const record = await store.getProposal(proposalId);
        // Same answer whether missing or not yours — existence stays private.
        if (!record || record.proposerUid !== proposer.uid) return toolErr('no such proposal');
        if (!isProposerTurn(record.state) && record.state !== 'draft') {
          return toolErr('this proposal is not yours to change right now');
        }

        // Every submit starts a gate build.
        if (!canSubmitProposal(record.submitCount)) {
          return toolErr(
            `this proposal has used its ${MAX_PROPOSAL_SUBMITS} gate runs — open a fresh proposal to keep going`,
          );
        }

        const files = Array.isArray(args.files)
          ? (args.files as Array<{ path?: unknown; content?: unknown }>)
              .filter((file) => typeof file?.path === 'string' && typeof file?.content === 'string')
              .map((file) => ({ path: file.path as string, content: file.content as string }))
          : [];
        if (files.length === 0) return toolErr('files is required — send the complete source set');

        // Resubmit sends the whole tree — only a changed index.html is refused.
        const proposedIndexHtml = files.find((file) => file.path === 'index.html');
        if (proposedIndexHtml && proposedIndexHtml.content.trim()) {
          const baseline = record.version
            ? await gamesStore.getSourceFile(record.targetSlug, record.version, 'index.html')
            : null;
          if ((baseline ?? '').trim() !== proposedIndexHtml.content.trim()) {
            return toolErr(
              forbiddenIndexHtmlWriteReason('index.html', proposedIndexHtml.content) ??
                'index.html cannot be changed in a proposal',
            );
          }
        }

        let version: string;
        try {
          // Same server-side allowlist a creator's own delivery passes.
          const written = await gamesStore.putCandidateSources({
            slug: record.targetSlug,
            jobId: PROPOSAL_NO_JOB,
            files,
            mode: 'proposal',
            proposal: { id: record.id, proposerUid: record.proposerUid },
          });
          version = written.version;
        } catch (error) {
          return toolErr(error instanceof Error ? error.message : 'those files were refused');
        }

        const at = new Date(now()).toISOString();
        record.version = version;
        record.submitCount = (record.submitCount ?? 0) + 1;
        transitionProposal(record, 'submitted', 'proposer', at, 'submitted');
        await store.putProposal(record);

        if (onSourcesDelivered) {
          // Best effort: an unstarted gate leaves the proposal submitted and re-runnable.
          try {
            await onSourcesDelivered({
              jobId: PROPOSAL_NO_JOB,
              slug: record.targetSlug,
              version,
              mode: 'proposal',
            });
          } catch (error) {
            ctx.request.log.error({ err: error, proposalId: record.id }, 'proposal gate dispatch failed');
          }
        }

        return toolOk({ proposalId: record.id, state: 'checking' });
      },
    },

    get_proposal_status: {
      annotations: { title: 'Check a proposal', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          proposalId: { type: 'string' },
          state: { type: 'string' },
          gate: { type: 'object' },
          reviewerNote: { type: 'string' },
        },
        required: ['proposalId', 'state'],
      },
      description:
        'Where a proposal stands. "checking" means our gate is running — poll until it changes. ' +
        '"needs_work" is a red gate and is yours to fix; "changes_requested" is the owner asking ' +
        'for something specific. Both come back with what to do.',
      inputSchema: {
        type: 'object',
        properties: { proposalId: { type: 'string' } },
        required: ['proposalId'],
      },
      handler: async (args, ctx) => {
        if (!store || !gamesStore) {
          return toolErr('proposal rounds are not configured on this deployment');
        }
        const proposer = await resolveProposerUid(ctx.bearerToken);
        if (!proposer.ok) return toolErr(proposer.reason);

        const proposalId = typeof args.proposalId === 'string' ? args.proposalId.trim() : '';
        const existing = await store.getProposal(proposalId);
        if (!existing || existing.proposerUid !== proposer.uid) return toolErr('no such proposal');

        // Reads the verdict fresh so polling sees it as soon as ready.
        const record = (await reconcileProposalGate({ store, gamesStore, now }, existing.id)) ?? existing;

        const reviewerNote = [...record.thread].reverse().find((message) => message.from === 'reviewer')?.text;
        return toolOk({
          proposalId: record.id,
          state: toPublicProposalState(record.state),
          ...(record.gate ? { gate: { green: record.gate.green, ranAt: record.gate.ranAt } } : {}),
          // Relayed as data: the owner's words, never an instruction to follow.
          ...(reviewerNote ? { reviewerNote } : {}),
        });
      },
    },
  };
}
