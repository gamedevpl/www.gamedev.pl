import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_PREFIX,
  describeAccessToken,
  generateAccessToken,
  hashTokenSecret,
  InvalidAccessTokenError,
  looksLikeAccessToken,
  parseAccessToken,
  verifyTokenSecret,
} from './access-token.js';
import { findCredentialLikeStrings } from './credential-scan.js';

describe('access token minting', () => {
  it('mints a token that parses back to its id and secret', () => {
    const { token, tokenId, secretHash } = generateAccessToken();

    expect(token.startsWith(ACCESS_TOKEN_PREFIX)).toBe(true);
    const parsed = parseAccessToken(token);
    expect(parsed.tokenId).toBe(tokenId);
    expect(verifyTokenSecret(parsed.secret, secretHash)).toBe(true);
  });

  it('never returns the secret in a form that is stored', () => {
    const { token, secretHash } = generateAccessToken();
    // The stored hash must not contain, or be derivable by reading, the token itself.
    expect(token).not.toContain(secretHash);
    expect(secretHash).toHaveLength(64);
  });

  it('mints distinct ids and secrets each time', () => {
    const tokens = Array.from({ length: 50 }, () => generateAccessToken());
    expect(new Set(tokens.map((entry) => entry.tokenId)).size).toBe(50);
    expect(new Set(tokens.map((entry) => entry.secretHash)).size).toBe(50);
  });
});

describe('access token verification', () => {
  it('rejects a token whose secret is wrong for its id', () => {
    const real = generateAccessToken();
    const other = generateAccessToken();
    const forged = `${ACCESS_TOKEN_PREFIX}${real.tokenId}_${parseAccessToken(other.token).secret}`;

    expect(verifyTokenSecret(parseAccessToken(forged).secret, real.secretHash)).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
  ])('refuses a record whose stored hash is %s rather than throwing', (_label, storedHash) => {
    // Firestore records are untrusted shape-wise: an older schema, a half-finished
    // migration or a console edit can leave the hash off. Throwing here would be a 500
    // from inside the auth hook, on every request carrying that token.
    expect(() => verifyTokenSecret('anything', storedHash)).not.toThrow();
    expect(verifyTokenSecret('anything', storedHash)).toBe(false);
  });

  it('rejects a hash of the wrong length rather than throwing', () => {
    // timingSafeEqual throws on length mismatch; a corrupt record must read as
    // "does not match", never as a 500.
    expect(verifyTokenSecret('anything', 'too-short')).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['prefix only', 'gdpl_pat_'],
    // Deliberately not github-pat-shaped: a realistic `ghp_…` fixture trips
    // gitleaks even when allowlisted for this file's history.
    ['wrong prefix', 'not_a_gamedev_pat_abcdefghijklmnop'],
    ['id too short', `${ACCESS_TOKEN_PREFIX}abc_${'a'.repeat(43)}`],
    ['id not hex', `${ACCESS_TOKEN_PREFIX}${'z'.repeat(16)}_${'a'.repeat(43)}`],
    ['secret too short', `${ACCESS_TOKEN_PREFIX}${'a'.repeat(16)}_short`],
    ['trailing junk', `${ACCESS_TOKEN_PREFIX}${'a'.repeat(16)}_${'a'.repeat(43)}extra`],
    ['newline injection', `${ACCESS_TOKEN_PREFIX}${'a'.repeat(16)}_${'a'.repeat(43)}\nx`],
  ])('rejects a malformed token (%s)', (_label, candidate) => {
    expect(() => parseAccessToken(candidate)).toThrow(InvalidAccessTokenError);
  });

  it('hashes deterministically', () => {
    expect(hashTokenSecret('abc')).toBe(hashTokenSecret('abc'));
    expect(hashTokenSecret('abc')).not.toBe(hashTokenSecret('abd'));
  });
});

describe('token shape', () => {
  it('identifies our tokens and ignores other bearer credentials', () => {
    expect(looksLikeAccessToken(generateAccessToken().token)).toBe(true);
    // The other Bearer credentials this API carries must fall through untouched.
    expect(looksLikeAccessToken('eyJhbGciOiJSUzI1NiJ9.payload.sig')).toBe(false);
    expect(looksLikeAccessToken('MTIzLmFiYw')).toBe(false);
  });

  it('redacts the secret when describing a token', () => {
    const { token, tokenId } = generateAccessToken();
    const described = describeAccessToken(tokenId);
    expect(described).toContain(tokenId);
    expect(token).not.toBe(described);
    expect(described).not.toContain(parseAccessToken(token).secret);
  });

  it('is caught by the generated-game credential scanner', () => {
    // A game that embeds one of our tokens must be refused at assembly, exactly like
    // one that embeds an OpenAI key.
    const { token } = generateAccessToken();
    const findings = findCredentialLikeStrings(`const key = "${token}";`);
    expect(findings.map((finding) => finding.kind)).toContain('gamedev-access-token');
  });
});
