import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { InvalidAgentTokenError, STALE_AGENT_TOKEN_REASON } from './agent-token.js';

/**
 * Short-lived MCP session capability (BY-05).
 *
 * Issued by `start({ key })` after the round key validates. Signed over
 * `(sessionId, jobId, roundGeneration, exp)` so every later tool call can
 * authenticate independently — the transport `Mcp-Session-Id` header is never
 * authority (MCP streamable-HTTP spec). Distinct scope from the round key so
 * neither capability can be mistaken for the other.
 */

const SCOPE = 'mcp-session-v1';

/**
 * Default lifetime for a sessionKey, in hours.
 *
 * A sessionKey may outlive the round key's own `exp` — generation revocation
 * against the job document is the hard bound. The creator-visible "this key
 * expires" copy in Studio refers to the round key, not this ceiling.
 */
export const DEFAULT_MCP_SESSION_KEY_TTL_HOURS = 24;

export interface McpSessionKeyClaims {
  sessionId: string;
  jobId: number;
  roundGeneration: number;
  /** Unix seconds. */
  exp: number;
}

export interface MintMcpSessionKeyOptions {
  sessionId: string;
  jobId: number;
  roundGeneration: number;
  /** Epoch ms; defaults to `Date.now()`. */
  now?: number;
  /** Override TTL hours; useful in tests. */
  ttlHours?: number;
}

function sign(sessionId: string, jobId: number, roundGeneration: number, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${SCOPE}:${sessionId}:${jobId}:${roundGeneration}:${exp}`).digest('hex');
}

function safeEqualHex(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

/** Cryptographically random session id (visible ASCII, suitable for Mcp-Session-Id). */
export function newMcpSessionId(): string {
  return randomBytes(18).toString('hex');
}

export function mcpSessionKeyTtlHours(): number {
  const parsed = Number(process.env.MCP_SESSION_KEY_TTL_HOURS ?? DEFAULT_MCP_SESSION_KEY_TTL_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MCP_SESSION_KEY_TTL_HOURS;
}

/**
 * Mints a sessionKey. Callers pass the transport session id from `initialize` so
 * the capability is bound to that correlator without treating the header as auth.
 */
/** Visible ASCII without `.` — the token wire format uses `.` as a field delimiter. */
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

/** Shape check for a transport `Mcp-Session-Id` (and the id embedded in a sessionKey). */
export function looksLikeMcpSessionId(candidate: string): boolean {
  return SESSION_ID_RE.test(candidate);
}

export function mintMcpSessionKey(secret: string, options: MintMcpSessionKeyOptions): string {
  if (!options.sessionId || !SESSION_ID_RE.test(options.sessionId)) {
    throw new InvalidAgentTokenError('invalid session id');
  }
  if (!Number.isSafeInteger(options.jobId) || options.jobId <= 0) {
    throw new InvalidAgentTokenError('invalid job id');
  }
  if (!Number.isSafeInteger(options.roundGeneration) || options.roundGeneration < 1) {
    throw new InvalidAgentTokenError('invalid round generation');
  }
  const nowMs = options.now ?? Date.now();
  const ttlHours = options.ttlHours ?? mcpSessionKeyTtlHours();
  const exp = Math.floor(nowMs / 1000) + ttlHours * 60 * 60;
  const signature = sign(options.sessionId, options.jobId, options.roundGeneration, exp, secret);
  return Buffer.from(
    `${options.sessionId}.${options.jobId}.${options.roundGeneration}.${exp}.${signature}`,
    'utf8',
  ).toString('base64url');
}

/**
 * Shape-only classifier: does this string carry a sessionKey's wire format?
 *
 * Never a stand-in for {@link verifyMcpSessionKey} — no signature is checked, so this
 * decides only *which credential the caller supplied*, never whether it is valid. It
 * exists so `start` can tell an agent that presented a sessionKey that it presented
 * the wrong kind of key, rather than the generic "key is required", which reads as
 * "you sent nothing" when in fact something was sent.
 */
export function looksLikeMcpSessionKey(candidate: string): boolean {
  const parts = Buffer.from(candidate, 'base64url').toString('utf8').split('.');
  if (parts.length !== 5) return false;
  const [sessionId, jobIdRaw, generationRaw, expRaw, signature] = parts;
  return (
    Boolean(sessionId) &&
    SESSION_ID_RE.test(sessionId) &&
    /^\d+$/.test(jobIdRaw ?? '') &&
    /^\d+$/.test(generationRaw ?? '') &&
    /^\d+$/.test(expRaw ?? '') &&
    /^[a-f0-9]{64}$/i.test(signature ?? '')
  );
}

/**
 * Verifies the HMAC and returns claims. Does **not** check generation against the
 * job document — {@link classifyAgentTokenAccess} (via the MCP auth path) does that.
 */
export function verifyMcpSessionKey(token: string, secret: string): McpSessionKeyClaims {
  try {
    const parts = Buffer.from(token, 'base64url').toString('utf8').split('.');
    if (parts.length !== 5) {
      throw new InvalidAgentTokenError();
    }
    const [sessionId, jobIdRaw, generationRaw, expRaw, signature] = parts;
    if (
      !sessionId ||
      !jobIdRaw ||
      !generationRaw ||
      !expRaw ||
      !signature ||
      !SESSION_ID_RE.test(sessionId) ||
      !/^\d+$/.test(jobIdRaw) ||
      !/^\d+$/.test(generationRaw) ||
      !/^\d+$/.test(expRaw) ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      throw new InvalidAgentTokenError();
    }
    const jobId = Number.parseInt(jobIdRaw, 10);
    const roundGeneration = Number.parseInt(generationRaw, 10);
    const exp = Number.parseInt(expRaw, 10);
    if (
      !Number.isSafeInteger(jobId) ||
      jobId <= 0 ||
      !Number.isSafeInteger(roundGeneration) ||
      roundGeneration < 1 ||
      !Number.isSafeInteger(exp) ||
      exp <= 0
    ) {
      throw new InvalidAgentTokenError();
    }
    if (!safeEqualHex(signature, sign(sessionId, jobId, roundGeneration, exp, secret))) {
      throw new InvalidAgentTokenError();
    }
    return { sessionId, jobId, roundGeneration, exp };
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) {
      throw error;
    }
    throw new InvalidAgentTokenError();
  }
}

/** Expiry check only — generation checks go through {@link classifyAgentTokenAccess}. */
export function assertMcpSessionKeyUnexpired(claims: McpSessionKeyClaims, nowMs: number = Date.now()): void {
  if (claims.exp * 1000 <= nowMs) {
    throw new InvalidAgentTokenError(STALE_AGENT_TOKEN_REASON);
  }
}
