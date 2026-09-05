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

const opts = {
  audience: 'https://svc/api/internal/notify-sweep',
  serviceAccountEmail: 'sched@proj.iam.gserviceaccount.com',
};

describe('OidcInternalAuthVerifier', () => {
  it('accepts a token from the scheduler SA with a verified email', async () => {
    const v = new OidcInternalAuthVerifier({
      ...opts,
      client: fakeClient({ email: opts.serviceAccountEmail, email_verified: true }),
    });
    expect(await v.verify('Bearer good-token')).toBe(true);
  });

  it('rejects a token from a different service account', async () => {
    const v = new OidcInternalAuthVerifier({
      ...opts,
      client: fakeClient({ email: 'someone-else@evil.com', email_verified: true }),
    });
    expect(await v.verify('Bearer t')).toBe(false);
  });

  it('rejects an unverified email claim', async () => {
    const v = new OidcInternalAuthVerifier({
      ...opts,
      client: fakeClient({ email: opts.serviceAccountEmail, email_verified: false }),
    });
    expect(await v.verify('Bearer t')).toBe(false);
  });

  it('rejects a missing/malformed Authorization header', async () => {
    const v = new OidcInternalAuthVerifier({
      ...opts,
      client: fakeClient({ email: opts.serviceAccountEmail, email_verified: true }),
    });
    expect(await v.verify(undefined)).toBe(false);
    expect(await v.verify('token-without-bearer')).toBe(false);
  });

  it('fails closed when verifyIdToken throws (bad signature/audience)', async () => {
    const throwing = {
      verifyIdToken: async () => {
        throw new Error('bad audience');
      },
    } as unknown as OAuth2Client;
    const v = new OidcInternalAuthVerifier({ ...opts, client: throwing });
    expect(await v.verify('Bearer t')).toBe(false);
  });
});

describe('DenyAllInternalAuthVerifier', () => {
  it('denies everything', async () => {
    expect(await new DenyAllInternalAuthVerifier().verify('Bearer whatever')).toBe(false);
  });
});

describe('createInternalAuthVerifierFromEnv', () => {
  it('is deny-all when config is absent', async () => {
    const v = createInternalAuthVerifierFromEnv({} as NodeJS.ProcessEnv);
    expect(v).toBeInstanceOf(DenyAllInternalAuthVerifier);
  });

  it('is OIDC when both audience and SA are set', () => {
    const v = createInternalAuthVerifierFromEnv({
      NOTIFY_SWEEP_AUDIENCE: 'https://svc/api/internal/notify-sweep',
      NOTIFY_SWEEP_SA: 'sched@proj.iam.gserviceaccount.com',
    } as NodeJS.ProcessEnv);
    expect(v).toBeInstanceOf(OidcInternalAuthVerifier);
  });

  it('opens the seed handoff only for its own audience and the runtime SA', () => {
    const env = {
      SEED_DISPATCH_AUDIENCE: 'https://svc/api/internal/seed',
      SEED_DISPATCH_SA: 'runtime@proj.iam.gserviceaccount.com',
      NOTIFY_SWEEP_SA: 'sched@proj.iam.gserviceaccount.com',
    } as NodeJS.ProcessEnv;
    expect(createInternalAuthVerifierFromEnv(env, 'seedDispatch')).toBeInstanceOf(OidcInternalAuthVerifier);
    // The scheduler's SA must not open the seed route.
    const { SEED_DISPATCH_SA: _omit, ...withoutRuntimeSa } = env;
    expect(createInternalAuthVerifierFromEnv(withoutRuntimeSa as NodeJS.ProcessEnv, 'seedDispatch')).toBeInstanceOf(
      DenyAllInternalAuthVerifier,
    );
  });

  it('will not open the spend brake to the scheduler identity', () => {
    // Arming the brake must not mean editing the sweeps' identity.
    const withSweepSaOnly = createInternalAuthVerifierFromEnv(
      {
        SPEND_BRAKE_AUDIENCE: 'https://svc/api/internal/spend-brake',
        NOTIFY_SWEEP_SA: 'sched@proj.iam.gserviceaccount.com',
      } as NodeJS.ProcessEnv,
      'spendBrake',
    );
    expect(withSweepSaOnly).toBeInstanceOf(DenyAllInternalAuthVerifier);

    const withOwnCaller = createInternalAuthVerifierFromEnv(
      {
        SPEND_BRAKE_AUDIENCE: 'https://svc/api/internal/spend-brake',
        SPEND_BRAKE_CALLER_SA: 'spend-brake@proj.iam.gserviceaccount.com',
      } as NodeJS.ProcessEnv,
      'spendBrake',
    );
    expect(withOwnCaller).toBeInstanceOf(OidcInternalAuthVerifier);
  });

  it('uses a separate audience for the account deletion sweep', () => {
    const v = createInternalAuthVerifierFromEnv(
      {
        ACCOUNT_DELETION_SWEEP_AUDIENCE: 'https://svc/api/internal/account-deletion-sweep',
        NOTIFY_SWEEP_SA: 'sched@proj.iam.gserviceaccount.com',
      } as NodeJS.ProcessEnv,
      'accountDeletionSweep',
    );
    expect(v).toBeInstanceOf(OidcInternalAuthVerifier);
  });
});
