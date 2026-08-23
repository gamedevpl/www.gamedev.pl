import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/**
 * Sign in with Apple — ID token verification.
 *
 * Same seam pattern as `GoogleAuthVerifier` in `auth.ts`: an interface the routes depend
 * on, a real implementation backed by Apple's JWKS, and a fake in the tests. The two
 * providers deliberately do NOT share a verifier — Apple's token differs from Google's in
 * ways that would turn a shared code path into a pile of provider conditionals (see the
 * quirks below), and an auth verifier is the last place to trade clarity for reuse.
 */

/** Apple signs every ID token as this issuer. Anything else is not Apple. */
export const APPLE_ISSUER = 'https://appleid.apple.com';

export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

export class AppleAuthVerificationError extends Error {
  constructor(message = 'apple token verification failed') {
    super(message);
    this.name = 'AppleAuthVerificationError';
  }
}

export interface AppleAuthPayload {
  sub: string;
  email?: string;
  /**
   * Whether Apple has verified the address. Gates every access-control decision that
   * consults email — the private-beta allowlist and account linking — for the same
   * reason `GoogleAuthPayload.emailVerified` does.
   */
  emailVerified?: boolean;
  /**
   * True when the user chose "Hide My Email" and `email` is an
   * `@privaterelay.appleid.com` forwarding address rather than their real one.
   *
   * It is verified, and it is deliverable, but it is not an identifier anyone else
   * knows — so it must never be used to match this person against an existing account
   * or against an allowlist somebody typed by hand.
   */
  isPrivateEmail?: boolean;
}

export interface AppleAuthVerifier {
  verifyIdToken(idToken: string): Promise<AppleAuthPayload>;
}

/**
 * Apple sends `email_verified` and `is_private_email` as JSON booleans in some flows and
 * as the *strings* `"true"` / `"false"` in others — the same token, the same claim,
 * different types depending on how the client authenticated. `Boolean("false")` is `true`,
 * so reading these claims directly is a bug that fails open on exactly the claim that
 * gates the allowlist.
 */
export function appleClaimFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

/**
 * Parse the configured audience list.
 *
 * Deliberately a *set*, not one value: the web app authenticates against a Services ID
 * while a future Capacitor build authenticates against the app's bundle ID, and both mint
 * tokens for the same accounts. Verifying against a single audience would mean either
 * rejecting the store build or standing up a second verifier for it.
 */
export function parseAppleClientIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id !== ''),
    ),
  ];
}

export interface AppleAuthVerifierOptions {
  audiences: string[];
  /**
   * Overrides the remote JWKS. Only the tests pass this — they sign real RS256 tokens
   * with a local key, which is the only way to exercise the claim checks below without
   * either reaching Apple or stubbing out the very verification being tested.
   */
  keyResolver?: JWTVerifyGetKey;
}

export class DefaultAppleAuthVerifier implements AppleAuthVerifier {
  private readonly audiences: string[];
  private readonly keys: JWTVerifyGetKey;

  constructor(options: AppleAuthVerifierOptions) {
    this.audiences = options.audiences;
    // `createRemoteJWKSet` caches keys and re-fetches on an unknown `kid`, so Apple's key
    // rotation costs one extra request rather than a spell of failed sign-ins.
    this.keys = options.keyResolver ?? createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  }

  async verifyIdToken(idToken: string): Promise<AppleAuthPayload> {
    if (this.audiences.length === 0) {
      throw new AppleAuthVerificationError('APPLE_CLIENT_IDS is not configured');
    }

    try {
      const { payload } = await jwtVerify(idToken, this.keys, {
        issuer: APPLE_ISSUER,
        audience: this.audiences,
        // Pinned rather than inferred. An unpinned verifier will honour whatever `alg` the
        // token header asks for, which is the standing invitation behind every JWT
        // algorithm-confusion bug. Apple signs with RS256 and nothing else.
        algorithms: ['RS256'],
      });

      if (typeof payload.sub !== 'string' || payload.sub === '') {
        throw new AppleAuthVerificationError('missing sub in apple payload');
      }

      const email = typeof payload.email === 'string' ? payload.email : undefined;

      return {
        sub: payload.sub,
        email,
        emailVerified: appleClaimFlag(payload.email_verified),
        isPrivateEmail: appleClaimFlag(payload.is_private_email),
      };
    } catch (err: unknown) {
      if (err instanceof AppleAuthVerificationError) throw err;
      throw new AppleAuthVerificationError(err instanceof Error ? err.message : 'failed to verify token');
    }
  }
}

/**
 * A verifier that refuses everything, used when no audience is configured.
 *
 * Mirrors `DenyAllInternalAuthVerifier`: an unconfigured provider must be a closed door,
 * never an open one, and the route reads the same either way.
 */
export class DenyAllAppleAuthVerifier implements AppleAuthVerifier {
  async verifyIdToken(): Promise<AppleAuthPayload> {
    throw new AppleAuthVerificationError('sign in with apple is not configured');
  }
}

export function createAppleAuthVerifierFromEnv(env: NodeJS.ProcessEnv = process.env): AppleAuthVerifier {
  const audiences = parseAppleClientIds(env.APPLE_CLIENT_IDS);
  if (audiences.length === 0) return new DenyAllAppleAuthVerifier();
  return new DefaultAppleAuthVerifier({ audiences });
}

/**
 * The uid namespace for Apple identities.
 *
 * Parallel to Google's `g:` prefix. Apple's `sub` is scoped to the developer team, so it
 * is stable for this app forever and never collides with a Google sub.
 */
export function appleUid(sub: string): string {
  return `a:${sub}`;
}
