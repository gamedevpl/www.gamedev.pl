import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Per-job credentials for the agent container.
 *
 * The container never receives the real provider API key. It gets one of these
 * instead: a short-lived token bound to a single job, which only this proxy
 * accepts. That is the whole point of the design — if a subverted agent leaks its
 * token (into the published game, over the network, anywhere), the attacker gets
 * something that is scoped to one job, expires in minutes, is budget-capped, and
 * is worthless against the provider directly.
 *
 * Tokens are stateless (signed, not stored) so the proxy can validate them without
 * shared state, which keeps it deployable as a scale-to-zero service.
 *
 * Format: base64url(`${jobId}.${expiresAt}`) + '.' + base64url(hmac)
 */

export interface JobTokenClaims {
  jobId: string;
  /** Unix ms. */
  expiresAt: number;
}

export class InvalidJobTokenError extends Error {
  constructor(reason: string) {
    super(`invalid job token: ${reason}`);
    this.name = 'InvalidJobTokenError';
  }
}

const b64url = (value: string | Buffer): string => Buffer.from(value as string).toString('base64url');

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function mintJobToken(jobId: string, secret: string, ttlMs = 15 * 60 * 1000, now = Date.now()): string {
  if (!jobId) throw new Error('jobId is required to mint a job token');
  if (!secret) throw new Error('a signing secret is required to mint a job token');
  // '.' separates fields, so it must not appear inside one.
  if (jobId.includes('.')) throw new Error('jobId must not contain "."');

  const payload = `${jobId}.${now + ttlMs}`;
  return `${b64url(payload)}.${sign(payload, secret)}`;
}

export function verifyJobToken(token: string, secret: string, now = Date.now()): JobTokenClaims {
  if (!token) throw new InvalidJobTokenError('missing');

  const parts = token.split('.');
  if (parts.length !== 2) throw new InvalidJobTokenError('malformed');

  const [encodedPayload, signature] = parts as [string, string];
  const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  const expected = sign(payload, secret);

  // Constant-time compare so a forger can't learn the signature byte by byte.
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    throw new InvalidJobTokenError('bad signature');
  }

  const separator = payload.lastIndexOf('.');
  if (separator <= 0) throw new InvalidJobTokenError('malformed payload');

  const jobId = payload.slice(0, separator);
  const expiresAt = Number(payload.slice(separator + 1));
  if (!jobId || !Number.isFinite(expiresAt)) throw new InvalidJobTokenError('malformed payload');
  if (now >= expiresAt) throw new InvalidJobTokenError('expired');

  return { jobId, expiresAt };
}
