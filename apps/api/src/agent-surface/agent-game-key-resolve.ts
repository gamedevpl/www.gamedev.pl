/**
 * Resolve a durable per-game opener into an active self-build round (BY-23) or an
 * agent-opened improvement round (BY-24).
 *
 * Shared by MCP `start` and `open_round` so verification + ownership cannot drift.
 */

import {
  assertGameAgentKeyActive,
  GAME_NOT_PUBLISHED_REASON,
  looksLikeGameAgentKey,
  NO_OPEN_ROUND_REASON,
  PLATFORM_ROUND_REASON,
  ROTATED_GAME_KEY_REASON,
  verifyGameAgentKey,
  type GameAgentKeyClaims,
} from './agent-game-key.js';
import { InvalidAgentTokenError } from '../platform/agent-token.js';
import { isActiveBuildRound } from '../creation/job-state.js';
import type { GameAgentKeyRecord, Store, SubmissionRecord } from '../platform/store.js';
import { creatorOwnsSlug } from '../platform/slug-ownership.js';

export type ResolveGameKeyResult =
  { ok: true; claims: GameAgentKeyClaims; record: SubmissionRecord } | { ok: false; reason: string };

export type ResolveGameKeyForOpenRoundResult =
  | {
      ok: true;
      claims: GameAgentKeyClaims;
      publishedRecord: SubmissionRecord;
      /** When set, a round is already open — callers must not stack another. */
      activeRound: SubmissionRecord | null;
    }
  | { ok: false; reason: string };

/** Newest active build round for this slug owned by the creator, or null. */
export async function findActiveRoundForSlug(
  store: Store,
  slug: string,
  creatorUid: string,
): Promise<SubmissionRecord | null> {
  const bySlug = await store.listSubmissionsBySlug(slug);
  return bySlug.find((job) => job.ownerUid === creatorUid && !job.abandonedAt && isActiveBuildRound(job)) ?? null;
}

/**
 * Newest unpublished draft job for this slug owned by the creator, or null.
 * Used by MCP `continue_draft` — post-publish work uses `open_round` instead.
 */
export async function findDraftJobForSlug(
  store: Store,
  slug: string,
  creatorUid: string,
): Promise<SubmissionRecord | null> {
  const bySlug = await store.listSubmissionsBySlug(slug);
  return bySlug.find((job) => job.ownerUid === creatorUid && !job.abandonedAt && !job.publishedAt) ?? null;
}

/**
 * Signature, generation, expiry, and slug ownership — shared by `start` and `open_round`.
 * Does not require an open round or a published game.
 */
export async function verifyDurableGameAgentKey(
  store: Store,
  key: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<{ ok: true; claims: GameAgentKeyClaims; keyRecord: GameAgentKeyRecord } | { ok: false; reason: string }> {
  if (!looksLikeGameAgentKey(key)) {
    return { ok: false, reason: 'invalid key — ask the creator for the current prompt in their Studio thread' };
  }

  let claims: GameAgentKeyClaims;
  try {
    claims = verifyGameAgentKey(key, secret);
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) {
      return { ok: false, reason: 'invalid key — ask the creator for the current prompt in their Studio thread' };
    }
    throw error;
  }

  const keyRecord = await store.getGameAgentKey(claims.slug);
  if (!keyRecord) {
    return { ok: false, reason: ROTATED_GAME_KEY_REASON };
  }

  try {
    assertGameAgentKeyActive(claims, keyRecord, nowMs);
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) {
      return { ok: false, reason: error.message || ROTATED_GAME_KEY_REASON };
    }
    throw error;
  }

  if (keyRecord.ownerUid !== claims.creatorUid) {
    return { ok: false, reason: ROTATED_GAME_KEY_REASON };
  }

  if (!(await creatorOwnsSlug(store, claims.slug, claims.creatorUid))) {
    return { ok: false, reason: ROTATED_GAME_KEY_REASON };
  }

  return { ok: true, claims, keyRecord };
}

/**
 * Full durable-key verification for `start`: shared checks, then bind to the active
 * self round (or refuse with a distinct reason).
 */
export async function resolveGameAgentKeyForStart(
  store: Store,
  key: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<ResolveGameKeyResult> {
  const verified = await verifyDurableGameAgentKey(store, key, secret, nowMs);
  if (!verified.ok) return verified;

  const active = await findActiveRoundForSlug(store, verified.claims.slug, verified.claims.creatorUid);
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
 * Durable-key verification for `open_round`: published game and idempotent binding
 * when a round is already open. The BY-24 per-game opt-in is withdrawn (BY-27b) —
 * `allowAgentOpenRounds` on existing records is ignored.
 */
export async function resolveGameAgentKeyForOpenRound(
  store: Store,
  key: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<ResolveGameKeyForOpenRoundResult> {
  const verified = await verifyDurableGameAgentKey(store, key, secret, nowMs);
  if (!verified.ok) return verified;

  const publishedRecord = await store.getPublishedSubmissionBySlug(verified.claims.slug);
  if (!publishedRecord) {
    return { ok: false, reason: GAME_NOT_PUBLISHED_REASON };
  }

  const activeRound = await findActiveRoundForSlug(store, verified.claims.slug, verified.claims.creatorUid);
  return { ok: true, claims: verified.claims, publishedRecord, activeRound };
}
