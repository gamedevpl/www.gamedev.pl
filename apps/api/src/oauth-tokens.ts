import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { OAuthAccessTokenRecord, OAuthGrantRecord, Store } from './store.js';

/**
 * OAuth access / refresh / authorization-code secrets for the MCP authorization
 * server (BY-18b). Same hashing discipline as personal access tokens in
 * `access-token.ts`: secrets are 256 bits of CSPRNG output, so stored digests
 * use SHA-256 rather than a password KDF. Stretching only protects low-entropy
 * secrets; these formats cannot produce them. A datastore dump yields hashes
 * that are not usable as credentials.
 */

export const OAUTH_ACCESS_TOKEN_PREFIX = 'gdpl_oat_';
export const OAUTH_REFRESH_TOKEN_PREFIX = 'gdpl_ort_';

const TOKEN_ID_BYTES = 8;
const TOKEN_SECRET_BYTES = 32;

const ACCESS_TOKEN_PATTERN = /^gdpl_oat_([0-9a-f]{16})_([A-Za-z0-9_-]{43})$/;
const REFRESH_TOKEN_PATTERN = /^gdpl_ort_([0-9a-f]{16})_([A-Za-z0-9_-]{43})$/;

export const OAUTH_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
export const OAUTH_REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const OAUTH_AUTH_CODE_TTL_MS = 10 * 60 * 1000;

export class InvalidOAuthTokenError extends Error {
  constructor(message = 'invalid oauth token') {
    super(message);
    this.name = 'InvalidOAuthTokenError';
  }
}

export interface GeneratedOAuthToken {
  token: string;
  tokenId: string;
  secretHash: string;
}

export interface VerifiedOAuthAccessToken {
  tokenId: string;
  grantId: string;
  ownerUid: string;
  scope: string;
}

function mintToken(prefix: string): GeneratedOAuthToken {
  const tokenId = randomBytes(TOKEN_ID_BYTES).toString('hex');
  const secret = randomBytes(TOKEN_SECRET_BYTES).toString('base64url');
  return {
    token: `${prefix}${tokenId}_${secret}`,
    tokenId,
    secretHash: hashOAuthSecret(secret),
  };
}

export function generateOAuthAccessToken(): GeneratedOAuthToken {
  return mintToken(OAUTH_ACCESS_TOKEN_PREFIX);
}

export function generateOAuthRefreshToken(): GeneratedOAuthToken {
  return mintToken(OAUTH_REFRESH_TOKEN_PREFIX);
}

export function generateOAuthAuthCode(): { code: string; codeId: string; codeHash: string } {
  const codeId = randomBytes(TOKEN_ID_BYTES).toString('hex');
  const secret = randomBytes(TOKEN_SECRET_BYTES).toString('base64url');
  return {
    code: `${codeId}.${secret}`,
    codeId,
    codeHash: hashOAuthSecret(secret),
  };
}

export function hashOAuthSecret(secret: string): string {
  // High-entropy CSPRNG API credentials, not user passwords — see file header /
  // access-token.ts. Stretching only protects low-entropy secrets.
  return (
    // codeql[js/insufficient-password-hash]
    // lgtm[js/insufficient-password-hash]
    createHash('sha256').update(secret).digest('hex')
  );
}

export function looksLikeOAuthAccessToken(value: string): boolean {
  return value.startsWith(OAUTH_ACCESS_TOKEN_PREFIX);
}

export function looksLikeOAuthRefreshToken(value: string): boolean {
  return value.startsWith(OAUTH_REFRESH_TOKEN_PREFIX);
}

export function parseOAuthAccessToken(token: string): { tokenId: string; secret: string } {
  const match = ACCESS_TOKEN_PATTERN.exec(token);
  if (!match) throw new InvalidOAuthTokenError('malformed oauth access token');
  const [, tokenId, secret] = match;
  if (!tokenId || !secret) throw new InvalidOAuthTokenError('malformed oauth access token');
  return { tokenId, secret };
}

export function parseOAuthRefreshToken(token: string): { tokenId: string; secret: string } {
  const match = REFRESH_TOKEN_PATTERN.exec(token);
  if (!match) throw new InvalidOAuthTokenError('malformed oauth refresh token');
  const [, tokenId, secret] = match;
  if (!tokenId || !secret) throw new InvalidOAuthTokenError('malformed oauth refresh token');
  return { tokenId, secret };
}

export function verifyOAuthSecret(secret: string, expectedHash: string | undefined): boolean {
  if (typeof expectedHash !== 'string' || expectedHash.length === 0) return false;
  const actual = Buffer.from(hashOAuthSecret(secret), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function parseOAuthAuthCode(code: string): { codeId: string; secret: string } {
  const dot = code.indexOf('.');
  if (dot <= 0) throw new InvalidOAuthTokenError('malformed authorization code');
  const codeId = code.slice(0, dot);
  const secret = code.slice(dot + 1);
  if (!/^[0-9a-f]{16}$/.test(codeId) || secret.length < 32) {
    throw new InvalidOAuthTokenError('malformed authorization code');
  }
  return { codeId, secret };
}

export function isOAuthAccessTokenExpired(expiresAt: string, nowMs: number): boolean {
  const expiresMs = Date.parse(expiresAt);
  return !Number.isFinite(expiresMs) || expiresMs <= nowMs;
}

export function isOAuthRefreshExpired(expiresAt: string, nowMs: number): boolean {
  return isOAuthAccessTokenExpired(expiresAt, nowMs);
}

export async function verifyOAuthAccessToken(
  store: Store,
  token: string,
  nowMs: number = Date.now(),
): Promise<VerifiedOAuthAccessToken | null> {
  let parsed: { tokenId: string; secret: string };
  try {
    parsed = parseOAuthAccessToken(token);
  } catch {
    return null;
  }

  const record = await store.getOAuthAccessToken(parsed.tokenId);
  if (!record) return null;
  if (!verifyOAuthSecret(parsed.secret, record.secretHash)) return null;
  if (isOAuthAccessTokenExpired(record.expiresAt, nowMs)) {
    await store.deleteOAuthAccessToken(parsed.tokenId);
    return null;
  }

  const grant = await store.getOAuthGrant(record.grantId);
  if (!grant || grant.revokedAt) {
    await store.deleteOAuthAccessToken(parsed.tokenId);
    return null;
  }

  return {
    tokenId: record.tokenId,
    grantId: record.grantId,
    ownerUid: record.ownerUid,
    scope: grant.scope,
  };
}

export function buildOAuthAccessTokenRecord(
  generated: GeneratedOAuthToken,
  grant: OAuthGrantRecord,
  nowMs: number,
): OAuthAccessTokenRecord {
  return {
    tokenId: generated.tokenId,
    grantId: grant.grantId,
    ownerUid: grant.ownerUid,
    secretHash: generated.secretHash,
    expiresAt: new Date(nowMs + OAUTH_ACCESS_TOKEN_TTL_MS).toISOString(),
    createdAt: new Date(nowMs).toISOString(),
  };
}
