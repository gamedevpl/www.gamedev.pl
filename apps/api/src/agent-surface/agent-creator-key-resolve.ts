/**
 * Resolve a durable creator-wide opener into an active self-build round (BY-27a).
 *
 * Shared by MCP `start` and BY-27b `open_round` so verification cannot drift from
 * the OAuth Bearer + slug path after uid resolution.
 */

import {
  assertCreatorAgentKeyActive,
  looksLikeCreatorAgentKey,
  ROTATED_CREATOR_KEY_REASON,
  verifyCreatorAgentKey,
  type CreatorAgentKeyClaims,
} from './agent-creator-key.js';
import {
  GAME_NOT_PUBLISHED_REASON,
  NO_OPEN_ROUND_REASON,
  PLATFORM_ROUND_REASON,
  SLUG_NOT_ON_ACCOUNT_REASON,
} from './agent-game-key.js';
import { findActiveRoundForSlug } from './agent-game-key-resolve.js';
import { creatorOwnsSlug } from '../platform/slug-ownership.js';
import { InvalidAgentTokenError } from './agent-token.js';
import type { CreatorAgentKeyRecord, Store, SubmissionRecord } from '../platform/store.js';

export type VerifyCreatorAgentKeyResult =
  { ok: true; claims: CreatorAgentKeyClaims; keyRecord: CreatorAgentKeyRecord } | { ok: false; reason: string };

export type ResolveCreatorKeyForStartResult =
  { ok: true; claims: CreatorAgentKeyClaims; record: SubmissionRecord } | { ok: false; reason: string };

export type ResolveCreatorKeyForOpenRoundResult =
  | {
      ok: true;
      claims: CreatorAgentKeyClaims;
      publishedRecord: SubmissionRecord;
      activeRound: SubmissionRecord | null;
      slug: string;
    }
  | { ok: false; reason: string };

/**
 * Signature, generation, and expiry — shared by `start` and `open_round`.
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

/**
 * Creator-key verification for `open_round`: published game owned by the creator,
 * and idempotent binding when a round is already open. No per-game opt-in (BY-27b).
 */
export async function resolveCreatorAgentKeyForOpenRound(
  store: Store,
  key: string,
  secret: string,
  slug: string,
  nowMs: number = Date.now(),
): Promise<ResolveCreatorKeyForOpenRoundResult> {
  const verified = await verifyDurableCreatorAgentKey(store, key, secret, nowMs);
  if (!verified.ok) return verified;

  const owned = await resolveOwnedSlugForOpenRound(store, slug, verified.claims.creatorUid);
  if (!owned.ok) return owned;
  return {
    ok: true,
    claims: verified.claims,
    publishedRecord: owned.publishedRecord,
    activeRound: owned.activeRound,
    slug: owned.slug,
  };
}

/**
 * Everything `open_round` needs once the caller's identity is known, whatever proved it.
 *
 * Split out of the creator-key resolver so the OAuth path can reach it. Both credentials
 * answer the same question — *which creator is this* — and from there the slug ownership,
 * publish state and active-round lookups are identical. Duplicating them is how the two
 * paths drift into refusing different things for the same situation.
 */
export async function resolveOwnedSlugForOpenRound(
  store: Store,
  slug: string,
  creatorUid: string,
): Promise<
  | { ok: true; publishedRecord: SubmissionRecord; activeRound: SubmissionRecord | null; slug: string }
  | { ok: false; reason: string }
> {
  if (!(await creatorOwnsSlug(store, slug, creatorUid))) {
    return { ok: false, reason: SLUG_NOT_ON_ACCOUNT_REASON };
  }

  const publishedRecord = await store.getPublishedSubmissionBySlug(slug);
  if (!publishedRecord) {
    return { ok: false, reason: GAME_NOT_PUBLISHED_REASON };
  }

  const activeRound = await findActiveRoundForSlug(store, slug, creatorUid);
  return { ok: true, publishedRecord, activeRound, slug };
}
