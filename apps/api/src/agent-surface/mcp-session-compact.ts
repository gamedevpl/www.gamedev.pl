import { createHmac, timingSafeEqual } from 'node:crypto';
import { ACTOR_UID_RE, InvalidAgentTokenError } from '../platform/agent-token.js';
import type { McpSessionKeyClaims, MintMcpSessionKeyOptions } from './mcp-session-key.js';

export const COMPACT_PREFIX = 'mcp2_';
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

export function mintCompactSessionKey(secret: string, options: MintMcpSessionKeyOptions, exp: number): string {
  if (
    options.actorRevision !== undefined &&
    (!Number.isSafeInteger(options.actorRevision) || options.actorRevision < 0)
  ) {
    throw new InvalidAgentTokenError('invalid capability revision');
  }
  const payload = Buffer.from(
    JSON.stringify([
      options.sessionId,
      options.jobId,
      options.roundGeneration,
      exp,
      options.actorUid ?? null,
      options.actorRevision ?? null,
    ]),
    'utf8',
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${COMPACT_PREFIX}${payload}`).digest('base64url');
  return `${COMPACT_PREFIX}${payload}.${signature}`;
}

export function verifyCompactSessionKey(token: string, secret: string): McpSessionKeyClaims {
  const [payload, signature, extra] = token.slice(COMPACT_PREFIX.length).split('.');
  if (!payload || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) {
    throw new InvalidAgentTokenError();
  }
  const expected = createHmac('sha256', secret).update(`${COMPACT_PREFIX}${payload}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new InvalidAgentTokenError();
  const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!Array.isArray(claims) || claims.length !== 6) throw new InvalidAgentTokenError();
  const [sessionId, jobId, roundGeneration, exp, actorUid, actorRevision] = claims as unknown[];
  if (
    typeof sessionId !== 'string' ||
    !SESSION_ID_RE.test(sessionId) ||
    !Number.isSafeInteger(jobId) ||
    (jobId as number) <= 0 ||
    !Number.isSafeInteger(roundGeneration) ||
    (roundGeneration as number) < 1 ||
    !Number.isSafeInteger(exp) ||
    (exp as number) <= 0 ||
    (actorUid !== null && (typeof actorUid !== 'string' || !ACTOR_UID_RE.test(actorUid))) ||
    (actorRevision !== null && (!Number.isSafeInteger(actorRevision) || (actorRevision as number) < 0))
  ) {
    throw new InvalidAgentTokenError();
  }
  return {
    sessionId,
    jobId: jobId as number,
    roundGeneration: roundGeneration as number,
    exp: exp as number,
    ...(actorUid ? { actorUid: actorUid as string } : {}),
    ...(actorRevision === null ? {} : { actorRevision: actorRevision as number }),
  };
}
