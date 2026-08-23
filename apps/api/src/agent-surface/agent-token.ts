import { createHmac, timingSafeEqual } from 'node:crypto';

export { readBearerToken } from '../bearer.js';

/**
 * Build-channel tokens (docs/agent-live-channel-plan.md §1).
 *
 * The coding agent needs to authenticate to our API from inside its sandbox. Rather
 * than distributing a shared secret into that environment, each build round gets its
 * own capability token, minted from the job id and the round's generation, and handed
 * to the agent in the brief it was assigned.
 *
 * It is deliberately scoped: the HMAC covers a scope string, so a build token and a
 * submission token for the same job are different values even though both are keyed
 * off SUBMISSION_TOKEN_SECRET. One can never be forged from — or mistaken for — the
 * other, which matters because the submission token can spend quota and stop a build
 * while this one may only talk about it.
 *
 * Round-scoped tokens also carry a generation and an expiry. Closing a round bumps the
 * generation on the job document, so a copied token from an earlier round stops
 * validating without a revocation list. The expiry is the backstop for a round that
 * stalls after an agent connected: regenerating a prompt mints a fresh key with a new
 * `exp` without touching the generation.
 */

export class InvalidAgentTokenError extends Error {
  constructor(message = 'invalid build token') {
    super(message);
    this.name = 'InvalidAgentTokenError';
  }
}

const SCOPE = 'agent-channel-v1';
const MANAGED_MCP_OPENER_SCOPE = 'managed-mcp-opener-v1';

/** Default lifetime for a round-scoped build key, in days. */
export const DEFAULT_SELF_BUILD_KEY_TTL_DAYS = 14;

/**
 * The message every stale or expired build key answers with. Same wording whether the
 * generation moved on or the clock did — the creator's fix is always "copy the current
 * prompt from the Studio thread".
 */
export const STALE_AGENT_TOKEN_REASON = 'this build is finished — get a fresh prompt from your Studio thread';

export interface AgentTokenClaims {
  jobId: number;
  /**
   * Present on round-scoped tokens. Absent on the legacy jobId-only shape, which is
   * still accepted for jobs that have never closed a round under the new model.
   */
  roundGeneration?: number;
  /** Unix seconds. Present with {@link roundGeneration}. */
  exp?: number;
}

export interface MintAgentTokenOptions {
  roundGeneration: number;
  /** Epoch ms; defaults to `Date.now()`. */
  now?: number;
  /** Override {@link selfBuildKeyTtlDays}; useful in tests. */
  ttlDays?: number;
}

/**
 * Round-key lifetime. Reads `SELF_BUILD_KEY_TTL_DAYS` (default 14) and, when the
 * no-connect window is configured, never exceeds it — a key that outlived the
 * auto-abandon would contradict the promise that the round is over.
 */
export function selfBuildKeyTtlDays(): number {
  const parsed = Number(process.env.SELF_BUILD_KEY_TTL_DAYS ?? DEFAULT_SELF_BUILD_KEY_TTL_DAYS);
  const ttl = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SELF_BUILD_KEY_TTL_DAYS;
  const connectParsed = Number(process.env.SELF_BUILD_CONNECT_DAYS);
  if (Number.isFinite(connectParsed) && connectParsed > 0) {
    return Math.min(ttl, Math.floor(connectParsed));
  }
  return ttl;
}

function signLegacy(jobId: number, secret: string): string {
  return createHmac('sha256', secret).update(`${SCOPE}:${jobId}`).digest('hex');
}

function signRoundScoped(jobId: number, roundGeneration: number, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${SCOPE}:${jobId}:${roundGeneration}:${exp}`).digest('hex');
}

function signManagedMcpOpener(jobId: number, roundGeneration: number, exp: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${MANAGED_MCP_OPENER_SCOPE}:${jobId}:${roundGeneration}:${exp}`)
    .digest('hex');
}

function safeEqualHex(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Mints a round-scoped build-channel token.
 *
 * The signature covers `(scope, jobId, roundGeneration, exp)`. Callers that only need
 * a fresh `exp` for the same round (regenerating a Studio prompt) pass the current
 * generation unchanged.
 */
export function mintAgentToken(jobId: number, secret: string, options: MintAgentTokenOptions): string {
  if (!Number.isSafeInteger(jobId) || jobId <= 0) {
    throw new InvalidAgentTokenError('invalid job id');
  }
  if (!Number.isSafeInteger(options.roundGeneration) || options.roundGeneration < 1) {
    throw new InvalidAgentTokenError('invalid round generation');
  }
  const nowMs = options.now ?? Date.now();
  const ttlDays = options.ttlDays ?? selfBuildKeyTtlDays();
  const exp = Math.floor(nowMs / 1000) + ttlDays * 24 * 60 * 60;
  const signature = signRoundScoped(jobId, options.roundGeneration, exp, secret);
  return Buffer.from(`${jobId}.${options.roundGeneration}.${exp}.${signature}`, 'utf8').toString('base64url');
}

export function mintManagedMcpOpener(jobId: number, secret: string, options: MintAgentTokenOptions): string {
  if (!Number.isSafeInteger(jobId) || jobId <= 0) throw new InvalidAgentTokenError('invalid job id');
  if (!Number.isSafeInteger(options.roundGeneration) || options.roundGeneration < 1) {
    throw new InvalidAgentTokenError('invalid round generation');
  }
  const nowMs = options.now ?? Date.now();
  const ttlDays = options.ttlDays ?? selfBuildKeyTtlDays();
  const exp = Math.floor(nowMs / 1000) + ttlDays * 24 * 60 * 60;
  const signature = signManagedMcpOpener(jobId, options.roundGeneration, exp, secret);
  return Buffer.from(`${jobId}.${options.roundGeneration}.${exp}.${signature}`, 'utf8').toString('base64url');
}

export function verifyManagedMcpOpener(token: string, secret: string): AgentTokenClaims {
  try {
    const [jobIdRaw, generationRaw, expRaw, signature, ...extra] = Buffer.from(token, 'base64url')
      .toString('utf8')
      .split('.');
    if (
      extra.length ||
      !jobIdRaw ||
      !generationRaw ||
      !expRaw ||
      !signature ||
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
      exp <= 0 ||
      !safeEqualHex(signature, signManagedMcpOpener(jobId, roundGeneration, exp, secret))
    ) {
      throw new InvalidAgentTokenError();
    }
    return { jobId, roundGeneration, exp };
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) throw error;
    throw new InvalidAgentTokenError();
  }
}

/**
 * Legacy mint: HMAC over `(scope, jobId)` only. Kept for tests that need to synthesize
 * a pre-migration token; production minting always goes through {@link mintAgentToken}.
 */
export function mintLegacyAgentToken(jobId: number, secret: string): string {
  return Buffer.from(`${jobId}.${signLegacy(jobId, secret)}`, 'utf8').toString('base64url');
}

/**
 * Verifies the HMAC and returns the claims. Does **not** check generation against the
 * job document or expiry against the clock — {@link assertAgentTokenActive} does that
 * once the record is loaded.
 */
export function verifyAgentToken(token: string, secret: string): AgentTokenClaims {
  try {
    const parts = Buffer.from(token, 'base64url').toString('utf8').split('.');

    if (parts.length === 2) {
      const [jobIdRaw, signature] = parts;
      if (!jobIdRaw || !signature || !/^\d+$/.test(jobIdRaw) || !/^[a-f0-9]{64}$/i.test(signature)) {
        throw new InvalidAgentTokenError();
      }
      const jobId = Number.parseInt(jobIdRaw, 10);
      if (!Number.isSafeInteger(jobId) || jobId <= 0) {
        throw new InvalidAgentTokenError();
      }
      if (!safeEqualHex(signature, signLegacy(jobId, secret))) {
        throw new InvalidAgentTokenError();
      }
      return { jobId };
    }

    if (parts.length === 4) {
      const [jobIdRaw, generationRaw, expRaw, signature] = parts;
      if (
        !jobIdRaw ||
        !generationRaw ||
        !expRaw ||
        !signature ||
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
      if (!safeEqualHex(signature, signRoundScoped(jobId, roundGeneration, exp, secret))) {
        throw new InvalidAgentTokenError();
      }
      return { jobId, roundGeneration, exp };
    }

    throw new InvalidAgentTokenError();
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) {
      throw error;
    }
    throw new InvalidAgentTokenError();
  }
}

/**
 * Checks claims against the job's active generation and the clock.
 *
 * - Round-scoped token: generation must match, `exp` must be in the future.
 * - Legacy token: accepted only while the job has no generation field yet (an
 *   in-flight round that predates this model). The first round-close initializes
 *   the field, after which legacy tokens fail like any other stale key.
 */
export function assertAgentTokenActive(
  claims: AgentTokenClaims,
  record: { roundGeneration?: number },
  nowMs: number = Date.now(),
): void {
  const access = classifyAgentTokenAccess(claims, record, nowMs);
  if (access !== 'active') {
    throw new InvalidAgentTokenError(STALE_AGENT_TOKEN_REASON);
  }
}

/**
 * How a still-signature-valid capability relates to the job's current generation.
 *
 * - `active` — generation matches; full channel access.
 * - `terminal_receipt` — generation is exactly one behind current and unexpired.
 *   Only the gate reads — the verdict and the gate media (`get_gate_verdict` /
 *   `get_gate_media` and their plain-HTTP twins) — may use this: gate-green closes
 *   the round, so the agent's next verdict poll would otherwise be rejected a moment
 *   before it can observe the green it was told to wait for, and the frames it wants
 *   to show the creator exist only once that same run finished. Both are limited to
 *   the delivery the closed round owns. Every write and every other read still
 *   rejects. Expiry still applies.
 */
export type AgentTokenAccess = 'active' | 'terminal_receipt';

export function classifyAgentTokenAccess(
  claims: AgentTokenClaims,
  record: { roundGeneration?: number },
  nowMs: number = Date.now(),
): AgentTokenAccess {
  const active = record.roundGeneration;

  if (claims.roundGeneration !== undefined && claims.exp !== undefined) {
    if (claims.exp * 1000 <= nowMs) {
      throw new InvalidAgentTokenError(STALE_AGENT_TOKEN_REASON);
    }
    if (active !== undefined && claims.roundGeneration === active) {
      return 'active';
    }
    // Exactly one behind: the closed round that owns the job's current delivery.
    if (active !== undefined && claims.roundGeneration === active - 1) {
      return 'terminal_receipt';
    }
    throw new InvalidAgentTokenError(STALE_AGENT_TOKEN_REASON);
  }

  // Legacy shape: only while the job has never been generation-scoped.
  if (active !== undefined) {
    throw new InvalidAgentTokenError(STALE_AGENT_TOKEN_REASON);
  }
  return 'active';
}

/**
 * `readBearerToken` lives in `bearer.ts` and is re-exported above. The agent channel
 * takes its credential from a header rather than the path (unlike the creator-facing
 * status routes) because these calls come from scripts and CI-ish environments where
 * URLs end up in shell history and access logs.
 */
