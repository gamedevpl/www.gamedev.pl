import type { ReadGamePerformance } from '@gamedevpl/contract';
import type { Store } from '../platform/store.js';
import { GamePerformanceQuerySchema } from '../platform/game-performance-query.js';
import { looksLikeCreatorAgentKey } from './agent-creator-key.js';
import { verifyDurableCreatorAgentKey } from './agent-creator-key-resolve.js';
import { looksLikeAsAccessToken, verifyMcpAsAccessToken } from '../platform/oauth-scopes.js';
import { GAME_PERFORMANCE_OUTPUT_SCHEMA } from './mcp-performance-schema.js';
import { toolErr, toolOk } from './mcp-tool-support.js';
import type { AccountGamesToolEntry } from './mcp-account-games-tools.js';

export function createPerformanceTools(deps: {
  store?: Store;
  agentTokenSecret?: string;
  readGamePerformance?: ReadGamePerformance;
  now: () => number;
}): Record<string, AccountGamesToolEntry> {
  return {
    get_game_performance: {
      annotations: {
        title: 'Read production game performance',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        'Read production FPS for a published game owned by the authenticated creator. Works without start() or an active build round. Returns anonymous aggregates by build, device, resolution and reviewer cohort, measured/unmeasured coverage, gaps and truncation. No valid samples is not zero FPS. Agent-mode events and invalid windows are excluded. Read measuredAt/freshUntil: results may be cached for 10 minutes. Requires a creator key or OAuth with mcp scope in Authorization Bearer. Use list_account_games to discover slugs. Returns feature_unavailable until the MCP rollout is enabled. This read does not authorize automatic game changes.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Published game slug on this creator account.' },
          days: { type: 'integer', minimum: 1, maximum: 30, default: 7 },
          performanceReviewers: { type: 'string', enum: ['include', 'exclude', 'only'], default: 'include' },
          artifactVersion: {
            type: 'string',
            pattern: '^[a-f0-9]{64}$',
            description: 'Optional SHA-256 of served HTML from availableVersions, not a source commit.',
          },
        },
        required: ['slug'],
      },
      outputSchema: GAME_PERFORMANCE_OUTPUT_SCHEMA,
      handler: async (args, ctx) => {
        const { store, agentTokenSecret, readGamePerformance, now } = deps;
        if (!store || !agentTokenSecret || !readGamePerformance) return toolErr('performance reads are not configured');
        const bearer = ctx.bearerToken;
        let uid: string | undefined;
        if (bearer && looksLikeCreatorAgentKey(bearer)) {
          const verified = await verifyDurableCreatorAgentKey(store, bearer, agentTokenSecret, now());
          if (!verified.ok) return toolErr(verified.reason, { code: 'opener_required' });
          uid = verified.claims.creatorUid;
        } else if (bearer && looksLikeAsAccessToken(bearer)) {
          uid = (await verifyMcpAsAccessToken(store, bearer, now()))?.ownerUid;
        }
        if (!uid)
          return toolErr('get_game_performance requires a creator key or OAuth with mcp scope', {
            code: 'opener_required',
          });
        if (process.env.CREATOR_PERFORMANCE_MCP !== 'true')
          return toolErr('production performance MCP access is not enabled', { code: 'feature_unavailable' });
        const parsed = GamePerformanceQuerySchema.safeParse(args);
        if (!parsed.success) return toolErr('invalid performance query', { code: 'invalid_arguments' });
        const result = await readGamePerformance(uid, parsed.data);
        return result.ok
          ? toolOk(result.report)
          : toolErr(result.code, {
              code: result.code,
              ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
            });
      },
    },
  };
}
