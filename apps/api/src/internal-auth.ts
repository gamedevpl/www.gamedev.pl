// Auth for internal endpoints called by Cloud Scheduler (the notification sweep,
// docs/notifications-plan.md N1). The service is public (--allow-unauthenticated),
// so the endpoint verifies the caller's Google-signed OIDC token itself: it must
// be issued for our audience and carry the scheduler service account's verified
// email. Fails closed — unset config or any verification error denies access.
//
// Seam pattern (like GoogleAuthVerifier): a real OAuth2Client-backed verifier plus
// an injectable interface so tests never hit Google.

import { OAuth2Client } from 'google-auth-library';

export interface InternalAuthVerifier {
  /** Resolve true only for a valid scheduler OIDC token in the Authorization header. */
  verify(authorizationHeader: string | undefined): Promise<boolean>;
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
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
    const token = extractBearer(header);
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
 * Build the internal-auth verifier from env: OIDC when both NOTIFY_SWEEP_AUDIENCE
 * and NOTIFY_SWEEP_SA are set, otherwise deny-all (endpoint present but closed).
 */
export function createInternalAuthVerifierFromEnv(env: NodeJS.ProcessEnv = process.env): InternalAuthVerifier {
  const audience = env.NOTIFY_SWEEP_AUDIENCE?.trim();
  const serviceAccountEmail = env.NOTIFY_SWEEP_SA?.trim();
  if (audience && serviceAccountEmail) {
    return new OidcInternalAuthVerifier({ audience, serviceAccountEmail });
  }
  return new DenyAllInternalAuthVerifier();
}
