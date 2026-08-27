import type { BuilderKind } from '@gamedevpl/contract';
import {
  resolveCreatorAgentKeyForOpenRound,
  resolveOwnedSlugForOpenRound,
  verifyDurableCreatorAgentKey,
} from './agent-creator-key-resolve.js';
import { looksLikeCreatorAgentKey } from './agent-creator-key.js';
import {
  looksLikeGameAgentKey,
  SLUG_NOT_ON_ACCOUNT_REASON,
  GAME_ALREADY_PUBLISHED_REASON,
  DRAFT_NOT_CONTINUABLE_REASON,
  OPEN_ROUND_IN_PROGRESS_REASON,
  IMPROVEMENT_QUOTA_EXHAUSTED_REASON,
} from './agent-game-key.js';
import { findActiveRoundForSlug, findDraftJobForSlug } from './agent-game-key-resolve.js';
import { creatorOwnsSlug } from '../platform/slug-ownership.js';
import { looksLikeAsAccessToken, verifyAsAccessToken } from '../platform/oauth-tokens.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import { logModerationRejection } from '../platform/moderation-metrics.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { ContentChecker } from '../platform/moderation.js';
import type { ManagedUnavailableReason } from './managed-availability.js';
import {
  toolOk,
  toolErr,
  RETIRED_GAME_KEY_REASON,
  PLATFORM_CONNECTOR_ONLY_REASON,
  matchesPlatformConnectorSecret,
  type ToolHandler,
} from './mcp-tool-support.js';

const WRITES_ONCE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

// Studio labels and translates this relay of the creator's words.
const RELAY_VERBATIM =
  "Quote the creator's own words, in the language they used — this is shown to them as their request, so a " +
  'rewritten or translated summary reads as something they said and did not. Summarize only what will not fit.';

export interface RoundReopenToolsDeps {
  store: Store | undefined;
  agentTokenSecret: string | undefined;
  platformConnectorSecret: string | undefined;
  startImprovementRound:
    | ((input: {
        jobId: number;
        text: string;
        title: string;
        locale: string;
        log: { error: (context: object, message: string) => void };
        builder?: BuilderKind;
        openedBy?: 'creator' | 'agent';
        requestedBy?: 'creator' | 'agent';
        ownerUid?: string;
      }) => Promise<
        { route: 'job'; jobId: number } | { route: 'unavailable'; reason: ManagedUnavailableReason } | null
      >)
    | undefined;
  continueDraftRound:
    | ((input: {
        jobId: number;
        feedback: string;
        locale: string;
        log: { error: (context: object, message: string) => void };
        openedBy?: 'creator' | 'agent';
      }) => Promise<{ ok: true; jobId: number; alreadyOpen: boolean } | { ok: false; reason: string }>)
    | undefined;
  contentChecker: ContentChecker | undefined;
  dailyImprovementQuota: number;
  dailyFeedbackQuota: number;
  now: () => number;
}

export interface RoundReopenToolEntry {
  annotations: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

// Reopens a round: post-publish improvement, or an unpublished draft.
export function createRoundReopenTools(deps: RoundReopenToolsDeps): Record<string, RoundReopenToolEntry> {
  const {
    store,
    agentTokenSecret,
    platformConnectorSecret,
    startImprovementRound,
    continueDraftRound,
    contentChecker,
    dailyImprovementQuota,
    dailyFeedbackQuota,
    now,
  } = deps;

  return {
    open_round: {
      annotations: { title: 'Open an improvement round', ...WRITES_ONCE },
      outputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'number' },
          slug: { type: 'string' },
          alreadyOpen: { type: 'boolean', description: 'True when a round was already open; not an error.' },
        },
        required: ['jobId', 'slug', 'alreadyOpen'],
      },
      description:
        'Open a new post-publish improvement round on a published game. ' +
        'Accepts Authorization: Bearer (creator key or OAuth access) + slug. ' +
        'Spends the same daily improvement quota as Studio. ' +
        'Returns jobId only — call start() next for a sessionKey. Idempotent while a round is already open.',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Deprecated. Per-game keys are no longer accepted.',
          },
          slug: {
            type: 'string',
            description: 'Game slug. Required with a creator-key or OAuth Bearer.',
          },
          feedback: {
            type: 'string',
            description:
              'Creator change request for this improvement round (≤2000 chars). Treated as untrusted creator text. ' +
              RELAY_VERBATIM,
          },
        },
        required: ['feedback'],
      },
      handler: async (args, ctx) => {
        if (!store || !agentTokenSecret || !startImprovementRound || !contentChecker) {
          return toolErr('the MCP build endpoint is not configured');
        }

        const key = typeof args.key === 'string' ? args.key.trim() : '';
        const slugArg = typeof args.slug === 'string' ? args.slug.trim() : '';
        const bearer = ctx.bearerToken;

        if (matchesPlatformConnectorSecret(bearer, platformConnectorSecret)) {
          return toolErr(PLATFORM_CONNECTOR_ONLY_REASON);
        }

        const feedbackRaw = typeof args.feedback === 'string' ? args.feedback.trim() : '';
        if (!feedbackRaw) {
          return toolErr('feedback is required — relay what the creator wants changed');
        }
        if (feedbackRaw.length > 2000) {
          return toolErr('feedback is too long (max 2000 characters)');
        }

        type OpenResolved = {
          creatorUid: string;
          slug: string;
          publishedRecord: SubmissionRecord;
          activeRound: SubmissionRecord | null;
        };

        let resolved: OpenResolved;

        if (!key && bearer && looksLikeCreatorAgentKey(bearer)) {
          if (!slugArg) {
            return toolErr('slug is required when using a creator key — pass the game slug to improve');
          }
          const creatorResolved = await resolveCreatorAgentKeyForOpenRound(
            store,
            bearer,
            agentTokenSecret,
            slugArg,
            now(),
          );
          if (!creatorResolved.ok) {
            return toolErr(creatorResolved.reason);
          }
          resolved = {
            creatorUid: creatorResolved.claims.creatorUid,
            slug: creatorResolved.slug,
            publishedRecord: creatorResolved.publishedRecord,
            activeRound: creatorResolved.activeRound,
          };
        } else if (!key && bearer && looksLikeAsAccessToken(bearer)) {
          // `start` already accepted OAuth here; open_round was never taught the same identity.
          const asAccess = await verifyAsAccessToken(store, bearer, now());
          if (!asAccess) {
            return toolErr('invalid OAuth access — sign in again from your coding agent');
          }
          if (!slugArg) {
            return toolErr('slug is required when using OAuth — pass the game slug to improve');
          }
          const oauthResolved = await resolveOwnedSlugForOpenRound(store, slugArg, asAccess.ownerUid);
          if (!oauthResolved.ok) {
            return toolErr(oauthResolved.reason);
          }
          resolved = {
            creatorUid: asAccess.ownerUid,
            slug: oauthResolved.slug,
            publishedRecord: oauthResolved.publishedRecord,
            activeRound: oauthResolved.activeRound,
          };
        } else if (key && looksLikeGameAgentKey(key)) {
          return toolErr(RETIRED_GAME_KEY_REASON);
        } else if (key && looksLikeCreatorAgentKey(key)) {
          return toolErr('creator key must be sent as Authorization Bearer, not as the key argument');
        } else if (key) {
          return toolErr('open_round requires Authorization Bearer (creator key or OAuth) + slug');
        } else {
          return toolErr('pass Authorization Bearer (creator key or OAuth) + slug');
        }

        const at = new Date(now()).toISOString();
        // Ensures the gameAgentKeys/{slug} admission-lock doc exists for creator keys.
        const lockRecord = await store.ensureGameAgentKey(resolved.slug, resolved.creatorUid, at);
        if (!lockRecord) {
          // Existing doc owned by someone else — do not touch their admission lock.
          return toolErr(SLUG_NOT_ON_ACCOUNT_REASON);
        }

        if (resolved.activeRound) {
          await store.finishAgentOpenRound(resolved.slug, at);
          return toolOk({
            jobId: resolved.activeRound.jobId,
            slug: resolved.slug,
            alreadyOpen: true,
          });
        }

        const moderation = await contentChecker.checkFields([feedbackRaw]);
        if (!moderation.allowed) {
          logModerationRejection(ctx.request.log, {
            surface: 'creator_feedback',
            uid: resolved.creatorUid,
            category: moderation.category,
          });
          return toolErr('content_rejected', { category: moderation.category ?? 'other' });
        }

        const admitted = await store.beginAgentOpenRound(resolved.slug, at);
        if (!admitted) {
          const again = await findActiveRoundForSlug(store, resolved.slug, resolved.creatorUid);
          if (again) {
            return toolOk({
              jobId: again.jobId,
              slug: resolved.slug,
              alreadyOpen: true,
            });
          }
          return toolErr(OPEN_ROUND_IN_PROGRESS_REASON);
        }

        try {
          const racingRound = await findActiveRoundForSlug(store, resolved.slug, resolved.creatorUid);
          if (racingRound) {
            return toolOk({
              jobId: racingRound.jobId,
              slug: resolved.slug,
              alreadyOpen: true,
            });
          }

          const dateStr = at.slice(0, 10);
          const quota = await store.checkAndIncrementQuota(
            resolved.creatorUid,
            dateStr,
            dailyImprovementQuota,
            'improvements',
          );
          if (!quota.allowed) {
            if (quota.tier === 'blocked') {
              return toolErr('account is blocked');
            }
            return toolErr(IMPROVEMENT_QUOTA_EXHAUSTED_REASON);
          }

          const sanitizedFeedback = sanitizeCreatorText(feedbackRaw, { singleLine: false });
          const sanitizedTitle = sanitizeCreatorText(`Improve ${resolved.publishedRecord.title}`, {
            singleLine: true,
          });
          const started = await startImprovementRound({
            jobId: resolved.publishedRecord.jobId,
            text: sanitizedFeedback,
            title: sanitizedTitle,
            locale: resolved.publishedRecord.locale ?? 'en',
            log: ctx.request.log,
            builder: 'self',
            openedBy: 'agent',
            // Attributed to the agent, so the thread labels it correctly.
            requestedBy: 'agent',
            // Authorized creator wins over the published record's owner after a transfer.
            ownerUid: resolved.creatorUid,
          });
          if (!started || started.route === 'unavailable') {
            return toolErr('could not open an improvement round for this game');
          }

          return toolOk({
            jobId: started.jobId,
            slug: resolved.slug,
            alreadyOpen: false,
          });
        } finally {
          await store.finishAgentOpenRound(resolved.slug, at);
        }
      },
    },

    continue_draft: {
      annotations: { title: 'Continue an unpublished draft', ...WRITES_ONCE },
      outputSchema: {
        type: 'object',
        properties: {
          jobId: { type: 'number' },
          slug: { type: 'string' },
          alreadyOpen: { type: 'boolean', description: 'True when a round was already open; not an error.' },
          next: { type: 'string' },
        },
        required: ['jobId', 'slug', 'alreadyOpen'],
      },
      description:
        'Reopen an unpublished draft after a closed round (typically after a green gate). ' +
        'Accepts Authorization: Bearer (creator key or OAuth access) + slug. ' +
        'Not for published games — use open_round after publish. ' +
        'Returns jobId only — call start() next for a sessionKey. Idempotent while a round is already open.',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Deprecated. Per-game keys are no longer accepted.',
          },
          slug: {
            type: 'string',
            description: 'Game slug. Required with a creator-key or OAuth Bearer.',
          },
          feedback: {
            type: 'string',
            description:
              'Creator change request for this draft round (≤2000 chars). Treated as untrusted creator text. ' +
              RELAY_VERBATIM,
          },
        },
        required: ['feedback'],
      },
      handler: async (args, ctx) => {
        if (!store || !agentTokenSecret || !continueDraftRound || !contentChecker) {
          return toolErr('the MCP build endpoint is not configured');
        }

        const key = typeof args.key === 'string' ? args.key.trim() : '';
        const slugArg = typeof args.slug === 'string' ? args.slug.trim() : '';
        const bearer = ctx.bearerToken;

        if (matchesPlatformConnectorSecret(bearer, platformConnectorSecret)) {
          return toolErr(PLATFORM_CONNECTOR_ONLY_REASON);
        }

        const feedbackRaw = typeof args.feedback === 'string' ? args.feedback.trim() : '';
        if (!feedbackRaw) {
          return toolErr('feedback is required — relay what the creator wants changed');
        }
        if (feedbackRaw.length > 2000) {
          return toolErr('feedback is too long (max 2000 characters)');
        }

        type ContinueResolved = { creatorUid: string; slug: string; draft: SubmissionRecord };

        let resolved: ContinueResolved;

        if (!key && bearer && looksLikeCreatorAgentKey(bearer)) {
          if (!slugArg) {
            return toolErr('slug is required when using a creator key — pass the game slug to continue');
          }
          const verified = await verifyDurableCreatorAgentKey(store, bearer, agentTokenSecret, now());
          if (!verified.ok) return toolErr(verified.reason);
          if (!(await creatorOwnsSlug(store, slugArg, verified.claims.creatorUid))) {
            return toolErr(SLUG_NOT_ON_ACCOUNT_REASON);
          }
          if (await store.getPublishedSubmissionBySlug(slugArg)) {
            return toolErr(GAME_ALREADY_PUBLISHED_REASON);
          }
          const draft = await findDraftJobForSlug(store, slugArg, verified.claims.creatorUid);
          if (!draft) return toolErr(SLUG_NOT_ON_ACCOUNT_REASON);
          resolved = { creatorUid: verified.claims.creatorUid, slug: slugArg, draft };
        } else if (!key && bearer && looksLikeAsAccessToken(bearer)) {
          const asAccess = await verifyAsAccessToken(store, bearer, now());
          if (!asAccess) {
            return toolErr('invalid OAuth access — sign in again from your coding agent');
          }
          if (!slugArg) {
            return toolErr('slug is required when using OAuth — pass the game slug to continue');
          }
          if (!(await creatorOwnsSlug(store, slugArg, asAccess.ownerUid))) {
            return toolErr(SLUG_NOT_ON_ACCOUNT_REASON);
          }
          if (await store.getPublishedSubmissionBySlug(slugArg)) {
            return toolErr(GAME_ALREADY_PUBLISHED_REASON);
          }
          const draft = await findDraftJobForSlug(store, slugArg, asAccess.ownerUid);
          if (!draft) return toolErr(SLUG_NOT_ON_ACCOUNT_REASON);
          resolved = { creatorUid: asAccess.ownerUid, slug: slugArg, draft };
        } else if (key && looksLikeGameAgentKey(key)) {
          return toolErr(RETIRED_GAME_KEY_REASON);
        } else if (key && looksLikeCreatorAgentKey(key)) {
          return toolErr('creator key must be sent as Authorization Bearer, not as the key argument');
        } else if (key) {
          return toolErr('continue_draft requires Authorization Bearer (creator key or OAuth) + slug');
        } else {
          return toolErr('pass Authorization Bearer (creator key or OAuth) + slug');
        }

        // Publishing counts as active for inbox steering but must not be rejoined.
        if (resolved.draft.state === 'publishing') {
          return toolErr('this game is currently publishing — try again in a moment');
        }

        const active = await findActiveRoundForSlug(store, resolved.slug, resolved.creatorUid);
        if (active) {
          return toolOk({
            jobId: active.jobId,
            slug: resolved.slug,
            alreadyOpen: true,
            next: 'call start({ slug }) to join the build round',
          });
        }

        const moderation = await contentChecker.checkFields([feedbackRaw]);
        if (!moderation.allowed) {
          logModerationRejection(ctx.request.log, {
            surface: 'creator_feedback',
            uid: resolved.creatorUid,
            category: moderation.category,
          });
          return toolErr('content_rejected', { category: moderation.category ?? 'other' });
        }

        const dateStr = new Date(now()).toISOString().slice(0, 10);
        const quota = await store.checkAndIncrementQuota(resolved.creatorUid, dateStr, dailyFeedbackQuota, 'feedback');
        if (!quota.allowed) {
          if (quota.tier === 'blocked') {
            return toolErr('account is blocked');
          }
          return toolErr("today's feedback limit is used up — try again tomorrow, or from the Studio");
        }

        const sanitizedFeedback = sanitizeCreatorText(feedbackRaw, { singleLine: false });
        const continued = await continueDraftRound({
          jobId: resolved.draft.jobId,
          feedback: sanitizedFeedback,
          locale: resolved.draft.locale ?? 'en',
          log: ctx.request.log,
          openedBy: 'agent',
        });
        if (!continued.ok) {
          if (continued.reason === 'already_published') return toolErr(GAME_ALREADY_PUBLISHED_REASON);
          if (continued.reason === 'publishing') {
            return toolErr('this game is currently publishing — try again in a moment');
          }
          if (continued.reason === 'not_continuable') return toolErr(DRAFT_NOT_CONTINUABLE_REASON);
          return toolErr('could not continue this draft — try again shortly, or ask the creator in Studio');
        }

        return toolOk({
          jobId: continued.jobId,
          slug: resolved.slug,
          alreadyOpen: continued.alreadyOpen,
          next: 'call start({ slug }) to join the build round',
        });
      },
    },
  };
}
