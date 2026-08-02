import { describe, expect, it } from 'vitest';
import { pkceChallengeS256, verifyPkceS256 } from './oauth-pkce.js';

describe('oauth-pkce', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

  it('computes S256 challenge', () => {
    expect(pkceChallengeS256(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('verifies a valid pair', () => {
    const challenge = pkceChallengeS256(verifier);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it('rejects a wrong verifier', () => {
    const challenge = pkceChallengeS256(verifier);
    expect(verifyPkceS256(`${verifier}x`, challenge)).toBe(false);
  });

  it('rejects too-short verifiers', () => {
    expect(verifyPkceS256('short', pkceChallengeS256(verifier))).toBe(false);
  });
});
