import { describe, expect, it } from 'vitest';
import type { OAuth2Client } from 'google-auth-library';
import {
  createInternalAuthVerifierFromEnv,
  DenyAllInternalAuthVerifier,
  OidcInternalAuthVerifier,
} from './internal-auth.js';

function fakeClient(payload: Record<string, unknown> | null): OAuth2Client {
  return {
    verifyIdToken: async () => ({ getPayload: () => payload }),
  } as unknown as OAuth2Client;
}

const audience = 'https://relay/api/internal/mp/sessions';
const oldSa = 'compute@developer.gserviceaccount.com';
const newSa = 'gamedev-app@proj.iam.gserviceaccount.com';

function verifierFor(email: string, verified = true) {
  return new OidcInternalAuthVerifier({
    audience,
    serviceAccountEmail: [newSa, oldSa],
    client: fakeClient({ email, email_verified: verified }),
  });
}

describe('a caller list spans a runtime identity move', () => {
  it('accepts both the account being left and the one being taken', async () => {
    expect(await verifierFor(newSa).verify('Bearer t')).toBe(true);
    expect(await verifierFor(oldSa).verify('Bearer t')).toBe(true);
  });

  it('still refuses an account on neither end of the move', async () => {
    expect(await verifierFor('someone-else@proj.iam.gserviceaccount.com').verify('Bearer t')).toBe(false);
  });

  it('refuses an unverified email even when it is on the list', async () => {
    expect(await verifierFor(newSa, false).verify('Bearer t')).toBe(false);
  });

  it('reads the list from env, ignoring spacing', () => {
    const v = createInternalAuthVerifierFromEnv(
      { MP_RELAY_AUDIENCE: audience, MP_RELAY_CALLER_SA: ` ${newSa} , ${oldSa} ` } as NodeJS.ProcessEnv,
      'mpRelay',
    );
    expect(v).toBeInstanceOf(OidcInternalAuthVerifier);
  });

  it('stays closed when the list holds nothing but separators', () => {
    const v = createInternalAuthVerifierFromEnv(
      { MP_RELAY_AUDIENCE: audience, MP_RELAY_CALLER_SA: ' , ' } as NodeJS.ProcessEnv,
      'mpRelay',
    );
    expect(v).toBeInstanceOf(DenyAllInternalAuthVerifier);
  });
});
