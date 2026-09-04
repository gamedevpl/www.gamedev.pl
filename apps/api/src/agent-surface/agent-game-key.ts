/**
 * Durable per-game agent opener keys (BY-23).
 *
 * Distinct scope from round-scoped build keys (`agent-channel-v1`) and MCP session
 * keys (`mcp-session-v1`). This key may only be exchanged at `start` (and later
 * `open_round`) for a round-bound sessionKey — never accepted where a sessionKey or
 * round write capability is required.
 *
 * Revocation is `keyGeneration` on `gameAgentKeys/{slug}`, bumped only by an explicit
 * creator rotate. Round close does NOT bump it.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { InvalidAgentTokenError } from '../platform/agent-token.js';

export { InvalidAgentTokenError } from '../platform/agent-token.js';

const SCOPE = 'agent-game-v1';
/** Wire marker so this shape can never parse as a round-scoped key. */
const WIRE_PREFIX = 'g1';

/** Default lifetime for a durable per-game opener key, in days. */
export const DEFAULT_GAME_AGENT_KEY_TTL_DAYS = 90;

/**
 * Distinct from {@link STALE_AGENT_TOKEN_REASON}: the durable key itself is fine;
 * there is simply no self-build round open for the agent to join.
 */
export const NO_OPEN_ROUND_REASON =
  'no build round is open for this game; for an unpublished draft call continue_draft({ feedback }) then start(), ' +
  'or ask the creator to request a change in their Studio thread';

/** Active round exists but is platform-built — not the creator's agent's turn. */
export const PLATFORM_ROUND_REASON =
  'the open round for this game is built by the platform, not your agent — ask the creator to switch to their own agent in Studio';

/**
 * Bearer + slug identity paths: the slug is not on this creator's account.
 * Names the slug — never the key — so a mistype does not push a destructive rotate.
 * Same wording for "does not exist" and "belongs to someone else" (games are public).
 */
export const SLUG_NOT_ON_ACCOUNT_REASON =
  'no game with that slug on your account — check the slug in your Studio thread';

export const SESSION_KEY_IS_NOT_AN_OPENER_REASON =
  'that is a sessionKey from an earlier start() — start needs Authorization Bearer ' +
  '(creator key or OAuth) with the game slug, or an active round key';

/** Rotated or generation-mismatched durable key. */
export const ROTATED_GAME_KEY_REASON =
  'this game key was rotated — get a fresh prompt from the Studio thread for this game';

/** `open_round` only applies after the game has shipped. */
export const GAME_NOT_PUBLISHED_REASON =
  'this game is not published yet — improvement rounds open only after publish; ' +
  'to keep iterating on the draft call continue_draft({ feedback }) then start()';

/** `continue_draft` only applies before the game has shipped. */
export const GAME_ALREADY_PUBLISHED_REASON =
  'this game is already published — call open_round({ feedback }) then start() for an improvement round';

/** Draft job exists but cannot be reopened from its current state. */
export const DRAFT_NOT_CONTINUABLE_REASON =
  'this draft cannot be continued right now — wait for the current step to finish, or ask the creator in Studio';

/** Creator daily improvement quota exhausted on the agent-open path. */
export const IMPROVEMENT_QUOTA_EXHAUSTED_REASON =
  "today's improvement limit is used up — the creator can start another round tomorrow, or from the Studio";

/** Another `open_round` is already creating a job for this slug — retry shortly. */
export const OPEN_ROUND_IN_PROGRESS_REASON =
  'an improvement round is already being opened for this game — wait a moment and try again';

export interface GameAgentKeyClaims {
  slug: string;
  creatorUid: string;
  keyGeneration: number;
  /** Unix seconds. */
  exp: number;
}

export interface MintGameAgentKeyOptions {
  slug: string;
  creatorUid: string;
  keyGeneration: number;
  /** Epoch ms; defaults to `Date.now()`. */
  now?: number;
  /** Override {@link gameAgentKeyTtlDays}; useful in tests. */
  ttlDays?: number;
}

export function gameAgentKeyTtlDays(): number {
  const parsed = Number(process.env.GAME_AGENT_KEY_TTL_DAYS ?? DEFAULT_GAME_AGENT_KEY_TTL_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_GAME_AGENT_KEY_TTL_DAYS;
}

function signGameKey(slug: string, creatorUid: string, keyGeneration: number, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${SCOPE}:${slug}:${creatorUid}:${keyGeneration}:${exp}`).digest('hex');
}

function safeEqualHex(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function assertSlug(slug: string): void {
  // Slugs are dot-free; the wire format uses `.` as a field delimiter.
  if (!slug || slug.includes('.') || /\s/.test(slug)) {
    throw new InvalidAgentTokenError('invalid game slug');
  }
}

function assertCreatorUid(creatorUid: string): void {
  if (!creatorUid || /\s/.test(creatorUid)) {
    throw new InvalidAgentTokenError('invalid creator id');
  }
}

function encodeCreatorUid(creatorUid: string): string {
  assertCreatorUid(creatorUid);
  return Buffer.from(creatorUid, 'utf8').toString('base64url');
}

function decodeCreatorUid(encoded: string): string {
  try {
    const creatorUid = Buffer.from(encoded, 'base64url').toString('utf8');
    assertCreatorUid(creatorUid);
    return creatorUid;
  } catch {
    throw new InvalidAgentTokenError();
  }
}

/**
 * Mints a durable per-game opener. HMAC covers
 * `(agent-game-v1, slug, creatorUid, keyGeneration, exp)`.
 */
export function mintGameAgentKey(secret: string, options: MintGameAgentKeyOptions): string {
  assertSlug(options.slug);
  if (!Number.isSafeInteger(options.keyGeneration) || options.keyGeneration < 1) {
    throw new InvalidAgentTokenError('invalid key generation');
  }
  const nowMs = options.now ?? Date.now();
  const ttlDays = options.ttlDays ?? gameAgentKeyTtlDays();
  const exp = Math.floor(nowMs / 1000) + ttlDays * 24 * 60 * 60;
  const signature = signGameKey(options.slug, options.creatorUid, options.keyGeneration, exp, secret);
  const encodedUid = encodeCreatorUid(options.creatorUid);
  const payload = `${WIRE_PREFIX}.${options.slug}.${encodedUid}.${options.keyGeneration}.${exp}.${signature}`;
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * True when the decoded wire form matches the full durable game-key shape. Used to
 * reject these keys at sessionKey/Bearer write paths without inventing a second error.
 * Prefix-only checks false-positive on MCP session keys whose session id is `g1`.
 */
export function looksLikeGameAgentKey(token: string): boolean {
  try {
    const parts = Buffer.from(token, 'base64url').toString('utf8').split('.');
    if (parts.length !== 6) return false;
    const [prefix, slug, encodedUid, generationRaw, expRaw, signature] = parts;
    if (
      prefix !== WIRE_PREFIX ||
      !slug ||
      !encodedUid ||
      !generationRaw ||
      !expRaw ||
      !signature ||
      slug.includes('.') ||
      !/^\d+$/.test(generationRaw) ||
      !/^\d+$/.test(expRaw) ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      return false;
    }
    decodeCreatorUid(encodedUid);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifies HMAC and returns claims. Does **not** check keyGeneration against the store
 * or ownership — callers do that once the gameAgentKeys record is loaded.
 */
export function verifyGameAgentKey(token: string, secret: string): GameAgentKeyClaims {
  try {
    const parts = Buffer.from(token, 'base64url').toString('utf8').split('.');
    if (parts.length !== 6) {
      throw new InvalidAgentTokenError();
    }
    const [prefix, slug, encodedUid, generationRaw, expRaw, signature] = parts;
    if (
      prefix !== WIRE_PREFIX ||
      !slug ||
      !encodedUid ||
      !generationRaw ||
      !expRaw ||
      !signature ||
      !/^\d+$/.test(generationRaw) ||
      !/^\d+$/.test(expRaw) ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      throw new InvalidAgentTokenError();
    }
    assertSlug(slug);
    const creatorUid = decodeCreatorUid(encodedUid);
    const keyGeneration = Number.parseInt(generationRaw, 10);
    const exp = Number.parseInt(expRaw, 10);
    if (!Number.isSafeInteger(keyGeneration) || keyGeneration < 1 || !Number.isSafeInteger(exp) || exp <= 0) {
      throw new InvalidAgentTokenError();
    }
    if (!safeEqualHex(signature, signGameKey(slug, creatorUid, keyGeneration, exp, secret))) {
      throw new InvalidAgentTokenError();
    }
    return { slug, creatorUid, keyGeneration, exp };
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) {
      throw error;
    }
    throw new InvalidAgentTokenError();
  }
}

/**
 * Checks expiry and keyGeneration against the game's current record. Ownership of the
 * slug is a separate check (creator may have transferred / abandoned).
 */
export function assertGameAgentKeyActive(
  claims: GameAgentKeyClaims,
  record: { keyGeneration: number },
  nowMs: number = Date.now(),
): void {
  if (claims.exp * 1000 <= nowMs) {
    throw new InvalidAgentTokenError(ROTATED_GAME_KEY_REASON);
  }
  if (claims.keyGeneration !== record.keyGeneration) {
    throw new InvalidAgentTokenError(ROTATED_GAME_KEY_REASON);
  }
}
