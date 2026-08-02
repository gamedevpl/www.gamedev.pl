/**
 * Resolve a durable per-game opener into an active self-build round (BY-23).
 *
 * Shared by MCP `start` (and later `open_round`) so verification + ownership +
 * active-round selection cannot drift between callers.
 */

import {
  assertGameAgentKeyActive,
  NO_OPEN_ROUND_REASON,
  PLATFORM_ROUND_REASON,
  ROTATED_GAME_KEY_REASON,
  verifyGameAgentKey,
  type GameAgentKeyClaims,
} from './agent-game-key.js';
import { InvalidAgentTokenError } from './agent-token.js';
import { isActiveBuildRound } from './builder.js';
import type { Store, SubmissionRecord } from './store.js';

export type ResolveGameKeyResult =
  { ok: true; claims: GameAgentKeyClaims; record: SubmissionRecord } | { ok: false; reason: string };

/**
 * Creator still "owns" the slug when they have a non-abandoned submission for it
 * whose ownerUid matches the claims. Newest non-abandoned job decides ownership.
 */
export async function creatorOwnsSlug(store: Store, slug: string, creatorUid: string): Promise<boolean> {
  const owned = await store.listSubmissionsByOwner(creatorUid, { limit: 200 });
  return owned.some((job) => job.slug === slug && !job.abandonedAt);
}

/** Newest active build round for this slug owned by the creator, or null. */
export async function findActiveRoundForSlug(
  store: Store,
  slug: string,
  creatorUid: string,
): Promise<SubmissionRecord | null> {
  const owned = await store.listSubmissionsByOwner(creatorUid, { limit: 200 });
  const active = owned
    .filter((job) => job.slug === slug && !job.abandonedAt && isActiveBuildRound(job))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return active[0] ?? null;
}

/**
 * Full durable-key verification for `start`: signature, generation, expiry,
 * ownership, then bind to the active self round (or refuse with a distinct reason).
 */
export async function resolveGameAgentKeyForStart(
  store: Store,
  key: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<ResolveGameKeyResult> {
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

  const active = await findActiveRoundForSlug(store, claims.slug, claims.creatorUid);
  if (!active) {
    return { ok: false, reason: NO_OPEN_ROUND_REASON };
  }

  const builder = active.builder ?? 'platform';
  if (builder !== 'self') {
    return { ok: false, reason: PLATFORM_ROUND_REASON };
  }

  return { ok: true, claims, record: active };
}
