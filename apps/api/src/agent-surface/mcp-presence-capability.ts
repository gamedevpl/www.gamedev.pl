import { classifyAgentTokenAccess, verifyAgentToken, type AgentTokenClaims } from '../platform/agent-token.js';
import type { Store } from '../platform/store.js';
import { shouldEmitMcpPresencePulse, type McpPresencePulse } from './mcp-presence.js';
import { looksLikeMcpSessionKey, verifyMcpSessionKey } from './mcp-session-key.js';

// Presence uses a verified session key or round bearer.
export function resolvePresenceClaims(
  sessionKey: string,
  bearer: string | null,
  secret: string,
): AgentTokenClaims | null {
  if (sessionKey && looksLikeMcpSessionKey(sessionKey)) {
    try {
      const claims = verifyMcpSessionKey(sessionKey, secret);
      return { jobId: claims.jobId, roundGeneration: claims.roundGeneration, exp: claims.exp };
    } catch {
      return null;
    }
  }
  if (bearer) {
    try {
      return verifyAgentToken(bearer, secret);
    } catch {
      return null;
    }
  }
  return null;
}

// A pulse needs a live key for the current round.
export function presenceClaimsActive(
  claims: AgentTokenClaims,
  record: { roundGeneration?: number; receiptRound?: { generation: number } } | null,
  nowMs: number,
): boolean {
  if (!record) return false;
  try {
    return classifyAgentTokenAccess(claims, record, nowMs) === 'active';
  } catch {
    return false;
  }
}

// The job to pulse: signed, not throttled, and the live round.
export async function livePresencePulseJob(
  claims: AgentTokenClaims | null,
  store: Pick<Store, 'getSubmission'>,
  pulses: Map<number, McpPresencePulse>,
  at: number,
  key: string,
): Promise<number | null> {
  if (!claims || !shouldEmitMcpPresencePulse(pulses.get(claims.jobId), at, undefined, key)) return null;
  const record = await store.getSubmission(claims.jobId);
  return presenceClaimsActive(claims, record ?? null, at) ? claims.jobId : null;
}
