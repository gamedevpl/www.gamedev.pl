import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  APPLE_ISSUER,
  appleClaimFlag,
  appleUid,
  DefaultAppleAuthVerifier,
  DenyAllAppleAuthVerifier,
  parseAppleClientIds,
} from './apple-auth.js';

/**
 * These tests sign real RS256 tokens with a locally generated key and hand the verifier a
 * local JWKS, rather than stubbing `jwtVerify`. Stubbing it would leave every claim check
 * below — issuer, audience, expiry, algorithm — asserted against a mock instead of against
 * the library that actually enforces them in production, which is the half worth testing.
 */

const WEB_SERVICES_ID = 'pl.gamedev.web';
const IOS_BUNDLE_ID = 'pl.gamedev.app';

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  const publicJwk = (await exportJWK(pair.publicKey)) as JWK;
  publicJwk.kid = 'test-key';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  // A second key that the JWKS does NOT publish, standing in for a token forged by
  // somebody who is not Apple.
  const impostor = await generateKeyPair('RS256', { extractable: true });
  otherPrivateKey = impostor.privateKey;

  jwks = createLocalJWKSet({ keys: [publicJwk] });
});

interface TokenOverrides {
  iss?: string;
  aud?: string;
  sub?: string;
  expiresIn?: string;
  claims?: Record<string, unknown>;
  key?: CryptoKey;
}

async function appleToken(overrides: TokenOverrides = {}): Promise<string> {
  return await new SignJWT({
    email: 'creator@example.com',
    email_verified: true,
    ...overrides.claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(overrides.iss ?? APPLE_ISSUER)
    .setAudience(overrides.aud ?? WEB_SERVICES_ID)
    .setSubject(overrides.sub ?? '001234.abcdef.0000')
    .setIssuedAt()
    .setExpirationTime(overrides.expiresIn ?? '10m')
    .sign(overrides.key ?? privateKey);
}

function verifier(audiences: string[] = [WEB_SERVICES_ID, IOS_BUNDLE_ID]) {
  return new DefaultAppleAuthVerifier({ audiences, keyResolver: jwks });
}

describe('DefaultAppleAuthVerifier', () => {
  it('accepts a well-formed Apple token and returns its identity', async () => {
    const payload = await verifier().verifyIdToken(await appleToken());

    expect(payload.sub).toBe('001234.abcdef.0000');
    expect(payload.email).toBe('creator@example.com');
    expect(payload.emailVerified).toBe(true);
    expect(payload.isPrivateEmail).toBe(false);
  });

  it('accepts the iOS bundle ID as well as the web Services ID', async () => {
    // The reason audiences are a set: the store build authenticates as the app, the web
    // app as the Services ID, and both are the same accounts.
    const payload = await verifier().verifyIdToken(await appleToken({ aud: IOS_BUNDLE_ID }));

    expect(payload.sub).toBe('001234.abcdef.0000');
  });

  it('rejects a token minted for somebody else’s client', async () => {
    await expect(verifier().verifyIdToken(await appleToken({ aud: 'com.attacker.app' }))).rejects.toThrow();
  });

  it('rejects a token that is not from Apple', async () => {
    await expect(verifier().verifyIdToken(await appleToken({ iss: 'https://evil.example' }))).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    await expect(verifier().verifyIdToken(await appleToken({ expiresIn: '-1m' }))).rejects.toThrow();
  });

  it('rejects a token signed by a key Apple never published', async () => {
    await expect(verifier().verifyIdToken(await appleToken({ key: otherPrivateKey }))).rejects.toThrow();
  });

  it('rejects a token whose header asks for a symmetric algorithm', async () => {
    // Algorithm confusion: the classic attack is to re-sign with HS256 so the verifier
    // uses the *public* key as an HMAC secret. `algorithms: ['RS256']` is what refuses it.
    const forged = await new SignJWT({ email_verified: true })
      .setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
      .setIssuer(APPLE_ISSUER)
      .setAudience(WEB_SERVICES_ID)
      .setSubject('001234.abcdef.0000')
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode('public-key-bytes-as-secret'));

    await expect(verifier().verifyIdToken(forged)).rejects.toThrow();
  });

  it('rejects a token with no sub, which would otherwise become a uid of "a:undefined"', async () => {
    const noSub = await new SignJWT({ email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(APPLE_ISSUER)
      .setAudience(WEB_SERVICES_ID)
      .setExpirationTime('10m')
      .sign(privateKey);

    await expect(verifier().verifyIdToken(noSub)).rejects.toThrow(/sub/);
  });

  it('refuses to verify anything when no audience is configured', async () => {
    // Fail closed: an unconfigured provider must be a closed door, not one that
    // accidentally accepts a token addressed to any client at all.
    await expect(verifier([]).verifyIdToken(await appleToken())).rejects.toThrow(/APPLE_CLIENT_IDS/);
  });

  describe('Apple’s string-or-boolean claims', () => {
    it('reads the string "true" as true', async () => {
      const payload = await verifier().verifyIdToken(
        await appleToken({ claims: { email_verified: 'true', is_private_email: 'true' } }),
      );

      expect(payload.emailVerified).toBe(true);
      expect(payload.isPrivateEmail).toBe(true);
    });

    it('reads the string "false" as false', async () => {
      // The bug this pins: `Boolean("false")` is true, so a naive read of this claim
      // fails OPEN on the exact flag that gates the beta allowlist and account linking.
      const payload = await verifier().verifyIdToken(
        await appleToken({ claims: { email_verified: 'false', is_private_email: 'false' } }),
      );

      expect(payload.emailVerified).toBe(false);
      expect(payload.isPrivateEmail).toBe(false);
    });

    it('treats a missing claim as false rather than undefined', async () => {
      const payload = await verifier().verifyIdToken(await appleToken({ claims: { email_verified: undefined } }));

      expect(payload.emailVerified).toBe(false);
    });
  });
});

describe('appleClaimFlag', () => {
  it('is true only for the boolean and the string spellings of true', () => {
    expect(appleClaimFlag(true)).toBe(true);
    expect(appleClaimFlag('true')).toBe(true);
  });

  it('is false for everything else, including truthy junk', () => {
    for (const value of [false, 'false', undefined, null, 0, 1, '', 'yes', {}]) {
      expect(appleClaimFlag(value)).toBe(false);
    }
  });
});

describe('parseAppleClientIds', () => {
  it('splits, trims and de-duplicates', () => {
    expect(parseAppleClientIds(' pl.gamedev.web , pl.gamedev.app , pl.gamedev.web ')).toEqual([
      'pl.gamedev.web',
      'pl.gamedev.app',
    ]);
  });

  it('is empty for unset, blank, or comma-only values', () => {
    expect(parseAppleClientIds(undefined)).toEqual([]);
    expect(parseAppleClientIds('')).toEqual([]);
    expect(parseAppleClientIds('  ,  ,')).toEqual([]);
  });
});

describe('DenyAllAppleAuthVerifier', () => {
  it('refuses every token', async () => {
    await expect(new DenyAllAppleAuthVerifier().verifyIdToken()).rejects.toThrow(/not configured/);
  });
});

describe('appleUid', () => {
  it('namespaces Apple subs so they can never collide with Google’s', () => {
    expect(appleUid('001234.abcdef.0000')).toBe('a:001234.abcdef.0000');
    expect(appleUid('x').startsWith('g:')).toBe(false);
  });
});
