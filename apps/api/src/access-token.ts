import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Personal access tokens — a user credential for programmatic callers
 * (docs/agent-access-tokens.md).
 *
 * The problem this solves: sign-in is Google-only, and a coding agent running in a
 * cloud VM has no browser session and no Google account. The alternatives were all
 * worse — an unauthenticated "test login" route is a bypass whatever it is named, and
 * a password database is a permanent liability created to solve a testing problem.
 * A token issued *to a real account* is neither: it authenticates as that user, with
 * that user's tier and quota, through the same request pipeline as everyone else.
 *
 * Shape: `gdpl_pat_<tokenId>_<secret>`.
 *
 * The id travels in the clear so verification is a single point lookup; only the
 * secret half is a credential. What is stored is `sha256(secret)`, never the token,
 * so a dump of the datastore yields nothing usable — the same reason the id and the
 * secret are separate fields rather than one opaque blob.
 *
 * SHA-256 (rather than argon2/scrypt, which a reviewer will reasonably ask about) is
 * correct *here* and would be wrong for a password: the secret is 256 bits of CSPRNG
 * output, so there is no guessable input to slow an attacker down to. Stretching only
 * buys protection against low-entropy secrets, which this format cannot produce.
 *
 * The `gdpl_pat_` prefix is deliberate and load-bearing in three places: it lets the
 * bearer-auth hook tell a PAT apart from the other Bearer credentials on this API
 * (build-channel tokens, scheduler OIDC) without guessing, it makes the token
 * greppable in a leaked log, and it is registered in `credential-scan.ts` so a
 * generated game that embeds one is refused at assembly.
 */

export const ACCESS_TOKEN_PREFIX = 'gdpl_pat_';

/** 8 bytes of id: enough that ids never collide, short enough to read in a log. */
const TOKEN_ID_BYTES = 8;
/** 32 bytes of secret — the actual credential. */
const TOKEN_SECRET_BYTES = 32;

/**
 * Anchored, exact-length, and character-class-bounded. Rejecting a malformed token on
 * shape alone matters beyond tidiness: it is what stops an unauthenticated caller from
 * turning a stream of garbage Authorization headers into a stream of datastore reads.
 */
const TOKEN_PATTERN = /^gdpl_pat_([0-9a-f]{16})_([A-Za-z0-9_-]{43})$/;

export class InvalidAccessTokenError extends Error {
  constructor(message = 'invalid access token') {
    super(message);
    this.name = 'InvalidAccessTokenError';
  }
}

export interface GeneratedAccessToken {
  /** The full credential. Returned to the operator once and never recoverable after. */
  token: string;
  tokenId: string;
  secretHash: string;
}

export function generateAccessToken(): GeneratedAccessToken {
  const tokenId = randomBytes(TOKEN_ID_BYTES).toString('hex');
  const secret = randomBytes(TOKEN_SECRET_BYTES).toString('base64url');
  return {
    token: `${ACCESS_TOKEN_PREFIX}${tokenId}_${secret}`,
    tokenId,
    secretHash: hashTokenSecret(secret),
  };
}

export function looksLikeAccessToken(value: string): boolean {
  return value.startsWith(ACCESS_TOKEN_PREFIX);
}

export function parseAccessToken(token: string): { tokenId: string; secret: string } {
  const match = TOKEN_PATTERN.exec(token);
  if (!match) throw new InvalidAccessTokenError('malformed access token');
  const [, tokenId, secret] = match;
  if (!tokenId || !secret) throw new InvalidAccessTokenError('malformed access token');
  return { tokenId, secret };
}

export function hashTokenSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function verifyTokenSecret(secret: string, expectedHash: string | undefined): boolean {
  // The hash arrives from Firestore, which TypeScript cannot vouch for: a record written
  // by an older schema, a half-finished migration or a hand edit in the console can be
  // missing it. Typed as possibly-undefined and refused here, because the alternative is
  // `Buffer.from(undefined)` throwing inside the auth hook — a 500 on every request
  // carrying that token, from a route with no try/catch around it. Same fail-closed
  // reasoning as `isAccessTokenExpired`.
  if (typeof expectedHash !== 'string' || expectedHash.length === 0) return false;

  const actual = Buffer.from(hashTokenSecret(secret), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  // Length check first: timingSafeEqual throws on a mismatch rather than returning false,
  // and a stored hash of the wrong length is corruption, not a credential to compare.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Redacted form for logs, listings and error messages — the id only, never the secret.
 * Displaying the id is safe by construction: it is the lookup key, not the credential.
 */
export function describeAccessToken(tokenId: string): string {
  return `${ACCESS_TOKEN_PREFIX}${tokenId}_…`;
}

/**
 * Fail closed on unparseable expiry timestamps. `Date.parse` returns NaN for
 * garbage, and `NaN <= now` is false — which would otherwise treat a corrupt
 * Firestore record as immortal.
 */
export function isAccessTokenExpired(expiresAt: string, nowMs: number): boolean {
  const expiresMs = Date.parse(expiresAt);
  return !Number.isFinite(expiresMs) || expiresMs <= nowMs;
}
