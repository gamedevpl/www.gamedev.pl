import { createHash, timingSafeEqual } from 'node:crypto';

/** RFC 7636 unreserved characters for the code verifier. */
const UNRESERVED = /^[A-Za-z0-9._~-]+$/;

const MIN_VERIFIER_LENGTH = 43;
const MAX_VERIFIER_LENGTH = 128;

export class PkceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PkceError';
  }
}

export function assertValidCodeVerifier(verifier: string): void {
  if (verifier.length < MIN_VERIFIER_LENGTH || verifier.length > MAX_VERIFIER_LENGTH) {
    throw new PkceError('code_verifier must be 43–128 characters');
  }
  if (!UNRESERVED.test(verifier)) {
    throw new PkceError('code_verifier contains invalid characters');
  }
}

/** S256 code challenge from a verifier. */
export function pkceChallengeS256(verifier: string): string {
  assertValidCodeVerifier(verifier);
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Verify an S256 PKCE pair. */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  try {
    assertValidCodeVerifier(verifier);
  } catch {
    return false;
  }
  if (challenge.length === 0) return false;
  const expected = pkceChallengeS256(verifier);
  const actual = Buffer.from(expected, 'utf8');
  const given = Buffer.from(challenge, 'utf8');
  if (actual.length !== given.length) return false;
  return timingSafeEqual(actual, given);
}
