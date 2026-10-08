import { createHmac, timingSafeEqual } from 'node:crypto';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';

// Bare GET URL for one creator reference image; curl needs no header.

const SCOPE = 'agent-reference-read-v1';
export const REFERENCE_IMAGE_URL_TTL_SECONDS = 60 * 60;
export const REFERENCE_IMAGE_DOWNLOAD_ROUTE = `${AGENT_CHANNEL_ROUTES.REFERENCE_IMAGES}/download`;

function sign(secret: string, jobId: number, shotId: string, exp: number): string {
  return createHmac('sha256', secret).update(`${SCOPE}:${jobId}:${shotId}:${exp}`).digest('base64url');
}

export function mintReferenceImageToken(
  secret: string,
  options: { jobId: number; shotId: string; nowMs: number; ttlSeconds?: number },
): { token: string; expiresAt: string } {
  const ttl = options.ttlSeconds ?? REFERENCE_IMAGE_URL_TTL_SECONDS;
  const exp = Math.floor(options.nowMs / 1000) + ttl;
  const shot = Buffer.from(options.shotId, 'utf8').toString('base64url');
  const token = `${options.jobId}.${shot}.${exp}.${sign(secret, options.jobId, options.shotId, exp)}`;
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyReferenceImageToken(
  secret: string,
  token: string,
  nowMs: number,
): { jobId: number; shotId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [jobRaw, shotRaw, expRaw, signature] = parts as [string, string, string, string];
  const jobId = Number(jobRaw);
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(jobId) || jobId <= 0 || !Number.isSafeInteger(exp)) return null;
  if (exp * 1000 <= nowMs) return null;
  const shotId = Buffer.from(shotRaw, 'base64url').toString('utf8');
  if (!shotId) return null;
  const expected = Buffer.from(sign(secret, jobId, shotId, exp));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { jobId, shotId };
}
