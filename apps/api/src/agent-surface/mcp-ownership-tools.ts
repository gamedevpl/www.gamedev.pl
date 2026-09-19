import { looksLikeCreatorAgentKey } from './agent-creator-key.js';
import { looksLikeGameAgentKey } from './agent-game-key.js';
import { looksLikeMcpSessionKey } from './mcp-session-key.js';
import { looksLikeAsAccessToken, OWNERSHIP_SCOPE, scopeIncludes } from '../platform/oauth-scopes.js';
import { verifyAsAccessToken } from '../platform/oauth-tokens.js';
import { canActOnGame, isGameMember, memberKey, viewerRoleOnGame } from '../platform/game-access-permissions.js';
import { resolveGameAccess } from '../platform/game-access-resolve.js';
import { isCanonicalSlug } from '../platform/slug-policy.js';
import { canonicalAppBaseUrl } from '../platform/canonical-app-url.js';
import {
  opaqueAccessVersion,
  parseAccessVersion,
  proposalReceiptStatus,
  transferProposalReviewPath,
} from '../store/records/game-transfer-proposal.js';
import type { Store } from '../platform/store.js';
import {
  toolOk,
  toolErr,
  PLATFORM_CONNECTOR_ONLY_REASON,
  RETIRED_GAME_KEY_REASON,
  matchesPlatformConnectorSecret,
  type ToolHandler,
} from './mcp-tool-support.js';

const READS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const OWNERSHIP_SCOPE_REQUIRED = 'ownership scope required — reconnect with the ownership OAuth scope';
export const GAME_UNAVAILABLE = 'game is not available';
const CREATOR_KEYS_DISABLED = 'creator API keys cannot use ownership tools';

export interface OwnershipToolsDeps {
  store: Store | undefined;
  platformConnectorSecret: string | undefined;
  now: () => number;
}

export interface OwnershipToolEntry {
  annotations: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

async function requireOwnershipAccount(
  deps: OwnershipToolsDeps,
  args: Record<string, unknown>,
  bearer: string | null,
): Promise<{ uid: string } | { error: string }> {
  if (typeof args.sessionKey === 'string' && args.sessionKey.trim()) {
    return { error: OWNERSHIP_SCOPE_REQUIRED };
  }
  if (!deps.store) return { error: 'the MCP build endpoint is not configured' };
  if (!bearer) return { error: OWNERSHIP_SCOPE_REQUIRED };
  if (matchesPlatformConnectorSecret(bearer, deps.platformConnectorSecret)) {
    return { error: PLATFORM_CONNECTOR_ONLY_REASON };
  }
  if (looksLikeGameAgentKey(bearer) || looksLikeMcpSessionKey(bearer)) {
    return { error: looksLikeGameAgentKey(bearer) ? RETIRED_GAME_KEY_REASON : OWNERSHIP_SCOPE_REQUIRED };
  }
  if (looksLikeCreatorAgentKey(bearer)) return { error: CREATOR_KEYS_DISABLED };
  if (!looksLikeAsAccessToken(bearer)) return { error: OWNERSHIP_SCOPE_REQUIRED };
  const access = await verifyAsAccessToken(deps.store, bearer, deps.now());
  if (!access || !scopeIncludes(access.scope, OWNERSHIP_SCOPE)) return { error: OWNERSHIP_SCOPE_REQUIRED };
  return { uid: access.ownerUid };
}

async function describeMember(store: Store, uid: string): Promise<string | null> {
  const user = await store.getUser(uid);
  return user?.profileName?.trim() || user?.handle || null;
}

function reviewUrl(slug: string, proposalId: string): string {
  return `${canonicalAppBaseUrl()}${transferProposalReviewPath(slug, proposalId)}`;
}

export function createOwnershipTools(deps: OwnershipToolsDeps): Record<string, OwnershipToolEntry> {
  const { store, now } = deps;
  return {
    get_game_access: {
      annotations: { title: 'Read current game access', ...READS },
      outputSchema: { type: 'object' },
      description: 'Read current role and members on a game the caller belongs to.',
      inputSchema: {
        type: 'object',
        properties: { slug: { type: 'string' } },
        required: ['slug'],
      },
      handler: async (args, ctx) => {
        const auth = await requireOwnershipAccount(deps, args, ctx.bearerToken);
        if ('error' in auth) return toolErr(auth.error);
        const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
        if (!store || !isCanonicalSlug(slug)) return toolErr(GAME_UNAVAILABLE);
        const access = await resolveGameAccess(store, slug);
        if (access.source !== 'canonical' || !isGameMember(access, auth.uid)) return toolErr(GAME_UNAVAILABLE);
        const role = viewerRoleOnGame(access, auth.uid);
        if (!role) return toolErr(GAME_UNAVAILABLE);
        const ownerUid = access.owner.kind === 'creator' ? access.owner.uid : null;
        const members = [];
        if (ownerUid) {
          members.push({
            memberKey: memberKey(slug, ownerUid),
            profileName: await describeMember(store, ownerUid),
            role: 'owner' as const,
          });
        }
        for (const editorUid of access.editorUids) {
          members.push({
            memberKey: memberKey(slug, editorUid),
            profileName: await describeMember(store, editorUid),
            role: 'editor' as const,
          });
        }
        const permittedActions = (
          ['read', 'edit', 'build', 'publish', 'manageMembers', 'transfer', 'delete', 'leave'] as const
        ).filter((action) => canActOnGame(access, auth.uid, action));
        return toolOk({
          slug,
          viewerRole: role,
          permittedActions,
          members,
          accessVersion: opaqueAccessVersion(access.accessRevision),
        });
      },
    },
    propose_game_transfer: {
      annotations: { title: 'Propose a game transfer for human review', ...WRITES },
      outputSchema: { type: 'object' },
      description: 'Create an expiring Studio transfer proposal. Does not pick a recipient or complete the transfer.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          expectedAccessVersion: { type: 'string' },
          idempotencyKey: { type: 'string' },
        },
        required: ['slug', 'expectedAccessVersion', 'idempotencyKey'],
      },
      handler: async (args, ctx) => {
        const auth = await requireOwnershipAccount(deps, args, ctx.bearerToken);
        if ('error' in auth) return toolErr(auth.error);
        const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
        const expectedAccessVersion =
          typeof args.expectedAccessVersion === 'string' ? args.expectedAccessVersion.trim() : '';
        const idempotencyKey = typeof args.idempotencyKey === 'string' ? args.idempotencyKey.trim() : '';
        if (!store || !isCanonicalSlug(slug) || !expectedAccessVersion || !idempotencyKey) {
          return toolErr(GAME_UNAVAILABLE);
        }
        const revision = parseAccessVersion(expectedAccessVersion);
        const access = await resolveGameAccess(store, slug);
        if (access.source !== 'canonical' || !canActOnGame(access, auth.uid, 'transfer') || revision === null) {
          return toolErr(GAME_UNAVAILABLE);
        }
        if (access.accessRevision !== revision) return toolErr('stale_access_version');
        const at = new Date(now()).toISOString();
        const result = await store.proposeGameTransfer({
          slug,
          ownerUid: auth.uid,
          accessRevision: access.accessRevision,
          expectedAccessVersion,
          idempotencyKey,
          at,
        });
        if (!result.ok) {
          if (result.reason === 'ineligible') return toolErr(GAME_UNAVAILABLE);
          return toolErr(result.reason === 'conflict' ? 'idempotency_conflict' : result.reason);
        }
        const proposal = result.proposal;
        return toolOk({
          proposalId: proposal.proposalId,
          reviewUrl: reviewUrl(proposal.slug, proposal.proposalId),
          expiresAt: proposal.expiresAt,
          accessVersion: expectedAccessVersion,
        });
      },
    },
    get_game_transfer_proposal_receipt: {
      annotations: { title: 'Read a transfer proposal receipt', ...READS },
      outputSchema: { type: 'object' },
      description: 'Look up a transfer proposal by idempotency key, then retry propose_game_transfer with that key.',
      inputSchema: {
        type: 'object',
        properties: { idempotencyKey: { type: 'string' } },
        required: ['idempotencyKey'],
      },
      handler: async (args, ctx) => {
        const auth = await requireOwnershipAccount(deps, args, ctx.bearerToken);
        if ('error' in auth) return toolErr(auth.error);
        const idempotencyKey = typeof args.idempotencyKey === 'string' ? args.idempotencyKey.trim() : '';
        if (!store || !idempotencyKey) return toolOk({ status: 'not_found' });
        const receipt = await store.getTransferProposalReceipt(auth.uid, idempotencyKey, new Date(now()).toISOString());
        if (receipt.status === 'not_found' || !receipt.proposal) return toolOk({ status: 'not_found' });
        const status =
          receipt.status === 'pending'
            ? proposalReceiptStatus(receipt.proposal, new Date(now()).toISOString())
            : receipt.status;
        const body: Record<string, string> = { status };
        if (status === 'ready') {
          body.proposalId = receipt.proposal.proposalId;
          body.reviewUrl = reviewUrl(receipt.proposal.slug, receipt.proposal.proposalId);
          body.expiresAt = receipt.proposal.expiresAt;
        }
        return toolOk(body);
      },
    },
  };
}
