/**
 * Durable creator-wide agent opener keys (BY-27a).
 *
 * Distinct scope from round-scoped build keys (`agent-channel-v1`), MCP session
 * keys (`mcp-session-v1`), and per-game openers (`agent-game-v1`). This key may
 * only be exchanged at `start` (and `open_round`) — together with a `slug` —
 * for a round-bound sessionKey. Never accepted where a sessionKey or round write
 * capability is required.
 *
 * Revocation is `keyGeneration` on `creatorAgentKeys/{uid}`, bumped only by an
 * explicit creator rotate/revoke. Round close does NOT bump it.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { InvalidAgentTokenError } from '../platform/agent-token.js';

export { InvalidAgentTokenError } from '../platform/agent-token.js';

const SCOPE = 'agent-creator-v1';
/** Wire marker so this shape can never parse as a per-game or session key. */
const WIRE_PREFIX = 'c1';
/**
 * Fixed segment after the prefix. Keeps the wire at 6 fields so a session key whose
 * session id is literally `c1` (5 fields: id.job.gen.exp.sig) cannot false-positive
 * {@link looksLikeCreatorAgentKey}.
 */
const WIRE_KIND = 'u';

/** Default lifetime for a durable creator opener key, in days. */
export const DEFAULT_CREATOR_AGENT_KEY_TTL_DAYS = 90;

/** Rotated or generation-mismatched creator key. */
export const ROTATED_CREATOR_KEY_REASON =
  'this creator key was rotated — mint a fresh one in Studio and update your agent config';

export interface CreatorAgentKeyClaims {
  creatorUid: string;
  keyGeneration: number;
  /** Unix seconds. */
  exp: number;
}

export interface MintCreatorAgentKeyOptions {
  creatorUid: string;
  keyGeneration: number;
  /** Epoch ms; defaults to `Date.now()`. */
  now?: number;
  /** Override {@link creatorAgentKeyTtlDays}; useful in tests. */
  ttlDays?: number;
}

export function creatorAgentKeyTtlDays(): number {
  const parsed = Number(process.env.CREATOR_AGENT_KEY_TTL_DAYS ?? DEFAULT_CREATOR_AGENT_KEY_TTL_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_CREATOR_AGENT_KEY_TTL_DAYS;
}

function signCreatorKey(creatorUid: string, keyGeneration: number, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${SCOPE}:${creatorUid}:${keyGeneration}:${exp}`).digest('hex');
}

function safeEqualHex(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
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
 * Mints a durable creator-wide opener. HMAC covers
 * `(agent-creator-v1, creatorUid, keyGeneration, exp)`.
 */
export function mintCreatorAgentKey(secret: string, options: MintCreatorAgentKeyOptions): string {
  if (!Number.isSafeInteger(options.keyGeneration) || options.keyGeneration < 1) {
    throw new InvalidAgentTokenError('invalid key generation');
  }
  const nowMs = options.now ?? Date.now();
  const ttlDays = options.ttlDays ?? creatorAgentKeyTtlDays();
  const exp = Math.floor(nowMs / 1000) + ttlDays * 24 * 60 * 60;
  const signature = signCreatorKey(options.creatorUid, options.keyGeneration, exp, secret);
  const encodedUid = encodeCreatorUid(options.creatorUid);
  const payload = `${WIRE_PREFIX}.${WIRE_KIND}.${encodedUid}.${options.keyGeneration}.${exp}.${signature}`;
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * True when the decoded wire form matches the full durable creator-key shape. Used to
 * reject these keys at sessionKey/Bearer write paths without inventing a second error.
 */
export function looksLikeCreatorAgentKey(token: string): boolean {
  try {
    const parts = Buffer.from(token, 'base64url').toString('utf8').split('.');
    if (parts.length !== 6) return false;
    const [prefix, kind, encodedUid, generationRaw, expRaw, signature] = parts;
    if (
      prefix !== WIRE_PREFIX ||
      kind !== WIRE_KIND ||
      !encodedUid ||
      !generationRaw ||
      !expRaw ||
      !signature ||
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
 * — callers do that once the creatorAgentKeys record is loaded.
 */
export function verifyCreatorAgentKey(token: string, secret: string): CreatorAgentKeyClaims {
  try {
    const parts = Buffer.from(token, 'base64url').toString('utf8').split('.');
    if (parts.length !== 6) {
      throw new InvalidAgentTokenError();
    }
    const [prefix, kind, encodedUid, generationRaw, expRaw, signature] = parts;
    if (
      prefix !== WIRE_PREFIX ||
      kind !== WIRE_KIND ||
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
    const creatorUid = decodeCreatorUid(encodedUid);
    const keyGeneration = Number.parseInt(generationRaw, 10);
    const exp = Number.parseInt(expRaw, 10);
    if (!Number.isSafeInteger(keyGeneration) || keyGeneration < 1 || !Number.isSafeInteger(exp) || exp <= 0) {
      throw new InvalidAgentTokenError();
    }
    if (!safeEqualHex(signature, signCreatorKey(creatorUid, keyGeneration, exp, secret))) {
      throw new InvalidAgentTokenError();
    }
    return { creatorUid, keyGeneration, exp };
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) {
      throw error;
    }
    throw new InvalidAgentTokenError();
  }
}

/**
 * Checks expiry, revocation, and keyGeneration against the creator's current record.
 */
export function assertCreatorAgentKeyActive(
  claims: CreatorAgentKeyClaims,
  record: { keyGeneration: number; revokedAt?: string },
  nowMs: number = Date.now(),
): void {
  if (record.revokedAt) {
    throw new InvalidAgentTokenError(ROTATED_CREATOR_KEY_REASON);
  }
  if (claims.exp * 1000 <= nowMs) {
    throw new InvalidAgentTokenError(ROTATED_CREATOR_KEY_REASON);
  }
  if (claims.keyGeneration !== record.keyGeneration) {
    throw new InvalidAgentTokenError(ROTATED_CREATOR_KEY_REASON);
  }
}

/** Last five characters of the wire key — enough to tell keys apart in Studio. */
export function creatorAgentKeyFingerprint(key: string): string {
  if (key.length <= 5) return key;
  return key.slice(-5);
}

/** Masked Authorization header value for display (never the full secret). */
export function maskCreatorAgentKeyHeader(key: string): string {
  return `Authorization: Bearer ····${creatorAgentKeyFingerprint(key)}`;
}
