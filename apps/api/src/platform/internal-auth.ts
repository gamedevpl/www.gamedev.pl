// Auth for internal endpoints called by Cloud Scheduler (the notification sweep,
// docs/notifications-plan.md N1). The service is public (--allow-unauthenticated),
// so the endpoint verifies the caller's Google-signed OIDC token itself: it must
// be issued for our audience and carry the scheduler service account's verified
// email. Fails closed — unset config or any verification error denies access.
//
// Seam pattern (like GoogleAuthVerifier): a real OAuth2Client-backed verifier plus
// an injectable interface so tests never hit Google.

import { OAuth2Client } from 'google-auth-library';
import { readBearerToken } from './bearer.js';

export interface InternalAuthVerifier {
  /** Resolve true only for a valid scheduler OIDC token in the Authorization header. */
  verify(authorizationHeader: string | undefined): Promise<boolean>;
}

export interface OidcVerifierOptions {
  /** Audience the scheduler mints the token for — the sweep endpoint URL. */
  audience: string;
  /** The scheduler service account email the token must belong to. */
  serviceAccountEmail: string;
  client?: OAuth2Client;
}

export class OidcInternalAuthVerifier implements InternalAuthVerifier {
  private readonly client: OAuth2Client;
  constructor(private readonly opts: OidcVerifierOptions) {
    this.client = opts.client ?? new OAuth2Client();
  }

  async verify(header: string | undefined): Promise<boolean> {
    const token = readBearerToken(header);
    if (!token) return false;
    try {
      const ticket = await this.client.verifyIdToken({ idToken: token, audience: this.opts.audience });
      const payload = ticket.getPayload();
      return payload?.email === this.opts.serviceAccountEmail && payload?.email_verified === true;
    } catch {
      return false;
    }
  }
}

/** A verifier that denies everything — the safe default when the sweep isn't configured. */
export class DenyAllInternalAuthVerifier implements InternalAuthVerifier {
  async verify(): Promise<boolean> {
    return false;
  }
}

/**
 * Which internal endpoint a verifier is for.
 *
 * There is one env var per sweep because **the audience is the endpoint's own URL** —
 * Cloud Scheduler mints a token for the exact URL it calls, so a verifier built for the
 * notify sweep rejects a token minted for the scorecard sweep and vice versa. That is
 * the property worth having: a token intercepted from one job cannot be replayed against
 * the other. The service account is shared (one scheduler identity), so only the
 * audience differs.
 */
const AUDIENCE_ENV_VAR = {
  notifySweep: 'NOTIFY_SWEEP_AUDIENCE',
  scorecardSweep: 'SCORECARD_SWEEP_AUDIENCE',
  digestSweep: 'DIGEST_SWEEP_AUDIENCE',
  suggestionSweep: 'SUGGESTION_SWEEP_AUDIENCE',
  healthSweep: 'HEALTH_SWEEP_AUDIENCE',
  accountDeletionSweep: 'ACCOUNT_DELETION_SWEEP_AUDIENCE',
  dispatchReaper: 'DISPATCH_REAPER_AUDIENCE',
  // Cloud Monitoring's Pub/Sub push, not the scheduler.
  spendBrake: 'SPEND_BRAKE_AUDIENCE',
  // Not a sweep and not called by the scheduler: this one is the app service calling the
  // split-out party relay (mp-relay.ts). The mechanism is identical — a Google-signed OIDC
  // token, audience-pinned to the callee's URL — so it reuses this seam rather than
  // growing a second one. Its caller identity differs, hence its own SA env var below.
  mpRelay: 'MP_RELAY_AUDIENCE',
  // App calling itself for seeding (seed-dispatch.ts); runtime SA.
  seedDispatch: 'SEED_DISPATCH_AUDIENCE',
} as const;

export type InternalSweep = keyof typeof AUDIENCE_ENV_VAR;

// Callers that are not the scheduler, and the env var naming each.

// Anything absent here is a scheduler job, authenticated by NOTIFY_SWEEP_SA.
const CALLER_SA_ENV_VAR: Partial<Record<InternalSweep, string>> = {
  mpRelay: 'MP_RELAY_CALLER_SA',
  spendBrake: 'SPEND_BRAKE_CALLER_SA',
  seedDispatch: 'SEED_DISPATCH_SA',
};

/**
 * Build the internal-auth verifier from env: OIDC when both the sweep's audience and
 * NOTIFY_SWEEP_SA are set, otherwise deny-all (endpoint present but closed).
 *
 * Fails closed per sweep rather than globally: configuring the notify sweep must not
 * silently open the scorecard sweep to a token minted for a different URL.
 */
export function createInternalAuthVerifierFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  sweep: InternalSweep = 'notifySweep',
): InternalAuthVerifier {
  const audience = env[AUDIENCE_ENV_VAR[sweep]]?.trim();
  // The relay and the brake have their own callers, opened by neither sweep.
  const serviceAccountEmail = CALLER_SA_ENV_VAR[sweep]
    ? env[CALLER_SA_ENV_VAR[sweep]]?.trim()
    : env.NOTIFY_SWEEP_SA?.trim();
  if (audience && serviceAccountEmail) {
    return new OidcInternalAuthVerifier({ audience, serviceAccountEmail });
  }
  return new DenyAllInternalAuthVerifier();
}
