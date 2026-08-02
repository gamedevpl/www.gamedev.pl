/**
 * Resolve a durable creator-wide opener into an active self-build round (BY-27a).
 *
 * Shared by MCP `start` so verification cannot drift from the OAuth Bearer + slug
 * path after uid resolution. `open_round` wiring lands with BY-27b — do not add an
 * unreachable resolver here ahead of that work.
 */

import {
  assertCreatorAgentKeyActive,
  looksLikeCreatorAgentKey,
  ROTATED_CREATOR_KEY_REASON,
  verifyCreatorAgentKey,
  type CreatorAgentKeyClaims,
} from './agent-creator-key.js';
import { NO_OPEN_ROUND_REASON, PLATFORM_ROUND_REASON, SLUG_NOT_ON_ACCOUNT_REASON } from './agent-game-key.js';
import { creatorOwnsSlug, findActiveRoundForSlug } from './agent-game-key-resolve.js';
import { InvalidAgentTokenError } from './agent-token.js';
import type { CreatorAgentKeyRecord, Store, SubmissionRecord } from './store.js';

export type VerifyCreatorAgentKeyResult =
  { ok: true; claims: CreatorAgentKeyClaims; keyRecord: CreatorAgentKeyRecord } | { ok: false; reason: string };

export type ResolveCreatorKeyForStartResult =
  { ok: true; claims: CreatorAgentKeyClaims; record: SubmissionRecord } | { ok: false; reason: string };

/**
 * Signature, generation, and expiry — shared by `start`.
 * Does not require an open round or a published game.
 */
export async function verifyDurableCreatorAgentKey(
  store: Store,
  key: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<VerifyCreatorAgentKeyResult> {
  if (!looksLikeCreatorAgentKey(key)) {
    return { ok: false, reason: 'invalid key — mint a fresh creator key in Studio' };
  }

  let claims: CreatorAgentKeyClaims;
  try {
    claims = verifyCreatorAgentKey(key, secret);
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) {
      return { ok: false, reason: 'invalid key — mint a fresh creator key in Studio' };
    }
    throw error;
  }

  const keyRecord = await store.getCreatorAgentKey(claims.creatorUid);
  if (!keyRecord) {
    return { ok: false, reason: ROTATED_CREATOR_KEY_REASON };
  }

  try {
    assertCreatorAgentKeyActive(claims, keyRecord, nowMs);
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) {
      return { ok: false, reason: error.message || ROTATED_CREATOR_KEY_REASON };
    }
    throw error;
  }

  if (keyRecord.ownerUid !== claims.creatorUid) {
    return { ok: false, reason: ROTATED_CREATOR_KEY_REASON };
  }

  return { ok: true, claims, keyRecord };
}

/**
 * Creator-key verification for `start`: shared checks, then bind to the active
 * self round for the given slug (same refusals as the OAuth branch).
 */
export async function resolveCreatorAgentKeyForStart(
  store: Store,
  key: string,
  secret: string,
  slug: string,
  nowMs: number = Date.now(),
): Promise<ResolveCreatorKeyForStartResult> {
  const verified = await verifyDurableCreatorAgentKey(store, key, secret, nowMs);
  if (!verified.ok) return verified;

  if (!(await creatorOwnsSlug(store, slug, verified.claims.creatorUid))) {
    return { ok: false, reason: SLUG_NOT_ON_ACCOUNT_REASON };
  }

  const active = await findActiveRoundForSlug(store, slug, verified.claims.creatorUid);
  if (!active) {
    return { ok: false, reason: NO_OPEN_ROUND_REASON };
  }

  const builder = active.builder ?? 'platform';
  if (builder !== 'self') {
    return { ok: false, reason: PLATFORM_ROUND_REASON };
  }

  return { ok: true, claims: verified.claims, record: active };
}
