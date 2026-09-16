import { looksLikeCreatorAgentKey } from './agent-creator-key.js';
import { verifyDurableCreatorAgentKey } from './agent-creator-key-resolve.js';
import { looksLikeGameAgentKey, SESSION_KEY_IS_NOT_AN_OPENER_REASON } from './agent-game-key.js';
import { looksLikeAsAccessToken, verifyMcpAsAccessToken as verifyAsAccessToken } from '../platform/oauth-scopes.js';
import { assertMcpSessionKeyUnexpired, looksLikeMcpSessionKey, verifyMcpSessionKey } from './mcp-session-key.js';
import { resolveGameAccess, roundAuthorityCurrent } from '../platform/game-access-resolve.js';
import { isGameMember } from '../platform/game-access-permissions.js';
import { assertAgentTokenActive, InvalidAgentTokenError, STALE_AGENT_TOKEN_REASON } from '../platform/agent-token.js';
import { isActiveBuildRound, resolveJobState } from '../creation/job-state.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import {
  toolOk,
  toolErr,
  RETIRED_GAME_KEY_REASON,
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

export const MAX_GAMES_LIMIT = 50;

export interface AccountOwnerGame {
  tip: SubmissionRecord;
  catalogPublishedAt?: string;
}

export type LoadOwnerGamesFn = (ownerUid: string) => Promise<AccountOwnerGame[]>;

export interface AccountGamesToolsDeps {
  store: Store | undefined;
  agentTokenSecret: string | undefined;
  platformConnectorSecret: string | undefined;
  now: () => number;
  loadOwnerGames?: LoadOwnerGamesFn;
}

export interface AccountGamesToolEntry {
  annotations: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

// Lists games belonging to the creator's account.
export function createAccountGamesTools(deps: AccountGamesToolsDeps): Record<string, AccountGamesToolEntry> {
  const { store, agentTokenSecret, platformConnectorSecret, now, loadOwnerGames } = deps;

  return {
    list_account_games: {
      annotations: {
        title: 'List games on this account',
        ...READS,
      },
      outputSchema: {
        type: 'object',
        properties: {
          games: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                slug: { type: ['string', 'null'] },
                title: { type: 'string' },
                state: { type: 'string' },
                round: { type: 'number' },
                published: { type: 'boolean' },
                hasActiveRound: { type: 'boolean' },
                builder: { type: 'string', enum: ['self', 'platform'] },
                createdAt: { type: 'string' },
                updatedAt: { type: 'string' },
              },
              required: ['title', 'state', 'round', 'published', 'hasActiveRound', 'builder', 'createdAt', 'updatedAt'],
            },
          },
          total: { type: 'number' },
        },
        required: ['games', 'total'],
      },
      description:
        "List games associated with the creator's account. " +
        'Accepts Authorization: Bearer (creator key or OAuth access), or sessionKey in arguments. ' +
        'Returns each game’s slug, title, state, round, published status, whether an active round is open ' +
        '(hasActiveRound), and builder. Use the returned slug with start({ slug }) if hasActiveRound is true, ' +
        'open_round({ slug, feedback }) if published, or continue_draft({ slug, feedback }) if an unpublished draft.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: {
            type: 'string',
            description: 'Optional. Active round session key, if already connected to a round.',
          },
          limit: {
            type: 'number',
            description: `Optional. Maximum number of games to return (1–${MAX_GAMES_LIMIT}, default ${MAX_GAMES_LIMIT}).`,
          },
        },
        required: [],
      },
      handler: async (args, ctx) => {
        const bearer = ctx.bearerToken;
        const sessionKeyArg = typeof args.sessionKey === 'string' ? args.sessionKey.trim() : '';

        if (!store || !agentTokenSecret) {
          return toolErr('the MCP build endpoint is not configured');
        }

        let creatorUid: string | null = null;

        if (sessionKeyArg || (bearer && looksLikeMcpSessionKey(bearer))) {
          const candidateKey = sessionKeyArg || bearer || '';
          try {
            const claims = verifyMcpSessionKey(candidateKey, agentTokenSecret);
            assertMcpSessionKeyUnexpired(claims, now());
            const job = await store.getSubmission(claims.jobId);
            if (!job || job.abandonedAt) {
              return toolErr('invalid sessionKey — call start() again');
            }
            assertAgentTokenActive(claims, job, now());
            const access = job.slug ? await resolveGameAccess(store, job.slug) : null;
            // A round key stops naming its creator once the game changes hands.
            if (access && !roundAuthorityCurrent(job, access)) {
              return toolErr('invalid sessionKey — call start() again');
            }
            const actorUid = claims.actorUid ?? job.ownerUid;
            if (access && claims.actorUid && !isGameMember(access, actorUid)) {
              return toolErr('invalid sessionKey — call start() again');
            }
            // Bound writer keeps their account; a former owner does not.
            const stillMember = !access || isGameMember(access, actorUid);
            const owner = access?.owner;
            const current = owner?.kind === 'creator' ? owner.uid : undefined;
            creatorUid = claims.actorUid ? actorUid : stillMember ? job.ownerUid : (current ?? job.ownerUid);
          } catch (error) {
            if (error instanceof InvalidAgentTokenError) {
              return toolErr(
                error.message === STALE_AGENT_TOKEN_REASON
                  ? STALE_AGENT_TOKEN_REASON
                  : 'invalid sessionKey — call start() again',
              );
            }
            throw error;
          }
        }

        if (!creatorUid && matchesPlatformConnectorSecret(bearer, platformConnectorSecret)) {
          return toolErr(PLATFORM_CONNECTOR_ONLY_REASON);
        }

        if (!creatorUid && bearer) {
          if (looksLikeGameAgentKey(bearer)) {
            return toolErr(RETIRED_GAME_KEY_REASON);
          }
          if (looksLikeCreatorAgentKey(bearer)) {
            const verified = await verifyDurableCreatorAgentKey(store, bearer, agentTokenSecret, now());
            if (!verified.ok) return toolErr(verified.reason);
            creatorUid = verified.claims.creatorUid;
          } else if (looksLikeAsAccessToken(bearer)) {
            const asAccess = await verifyAsAccessToken(store, bearer, now());
            if (!asAccess) return toolErr('invalid OAuth access — sign in again from your coding agent');
            creatorUid = asAccess.ownerUid;
          } else if (looksLikeMcpSessionKey(bearer)) {
            return toolErr(SESSION_KEY_IS_NOT_AN_OPENER_REASON);
          }
        }

        if (!creatorUid) {
          return toolErr('list_account_games needs Authorization Bearer with a creator key or OAuth access');
        }

        if (!store || !loadOwnerGames) {
          return toolErr('the MCP build endpoint is not configured');
        }

        const collapsed = await loadOwnerGames(creatorUid);

        const limitArg =
          typeof args.limit === 'number' && Number.isFinite(args.limit) && args.limit > 0
            ? Math.max(1, Math.min(Math.floor(args.limit), MAX_GAMES_LIMIT))
            : MAX_GAMES_LIMIT;

        const paged = collapsed.slice(0, limitArg);

        const games = paged.map((ownerGame) => {
          const tip = ownerGame.tip;
          const state = resolveJobState(tip) ?? 'queued';
          return {
            slug: tip.slug ?? null,
            title: tip.title,
            state,
            round: tip.roundGeneration ?? 1,
            published: Boolean(tip.publishedAt || ownerGame.catalogPublishedAt),
            hasActiveRound: !tip.abandonedAt && isActiveBuildRound({ state, transitions: tip.transitions }),
            builder: (tip.builder ?? 'platform') as 'self' | 'platform',
            createdAt: tip.createdAt,
            updatedAt: tip.stateSince ?? tip.lastAgentSignalAt ?? tip.createdAt,
          };
        });

        return toolOk({
          games,
          total: collapsed.length,
        });
      },
    },
  };
}
