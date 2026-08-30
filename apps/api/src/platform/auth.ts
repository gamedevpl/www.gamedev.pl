import { createHmac, timingSafeEqual } from 'node:crypto';
import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { resolveAccessTokenRecord, resolveAccessTokenUser } from './access-token-service.js';
import { isAdmin, isAdminSession } from './admin-session.js';
import { isReviewer, isReviewerSession } from '../community/review.js';
import { resolveAppleAccount } from './apple-account.js';
import { createAppleAuthVerifierFromEnv, parseAppleClientIds, type AppleAuthVerifier } from './apple-auth.js';
import { readBearerToken } from './bearer.js';
import { createMailerFromEnv } from '../notifications/mailer.js';
import { emitWaitlistJoined } from '../notifications/notify.js';
import { createPusherFromEnv } from '../notifications/pusher.js';
import { withActiveDay, type Store, type User } from './store.js';
import { normalizeLocale } from './translate.js';

/**
 * The signed-in creator's language, from the browser that signed them in.
 *
 * Recorded on the account because it is the only place the preference survives leaving
 * the browser. A game created through a coding agent has no `accept-language` — Claude
 * chat is not a browser — so without this, `create_game` had nothing to fall back on and
 * pinned every self-build game to English regardless of who owned it.
 *
 * Returns undefined when the header is absent, which must stay distinct from 'en': an
 * API client with no header should leave a stored preference alone, not overwrite it.
 * Signing in from a differently-configured browser does update it, which is the intended
 * reading of "preferred language" when there is no explicit setting to consult.
 */
function localeFromRequest(request: FastifyRequest): string | undefined {
  const header = request.headers['accept-language'];
  if (typeof header !== 'string' || !header.trim()) return undefined;
  return normalizeLocale(header.split(',')[0]);
}

export const SESSION_COOKIE_NAME = 'gamedev_session';

// Renewal fires only on requests, so this bounds absence between visits.
export const DEFAULT_SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Short on purpose: minted unattended, carries a token's authority.
export const TOKEN_SESSION_DURATION_SECONDS = 12 * 60 * 60; // 12 hours

export function sessionDurationSeconds(source?: 'token'): number {
  return source === 'token' ? TOKEN_SESSION_DURATION_SECONDS : DEFAULT_SESSION_DURATION_SECONDS;
}

// Proportional, or 12h sessions renew on nearly every request.
export function sessionRenewalThresholdSeconds(source?: 'token'): number {
  return Math.floor(sessionDurationSeconds(source) / 2);
}

export const BETA_INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export interface SessionPayload {
  uid: string;
  iat: number;
  exp: number;
  /**
   * Provenance: present (and only ever `'token'`) when this cookie was minted by
   * exchanging a personal access token at `/api/auth/session`, absent when a human
   * signed in with Google.
   *
   * It exists because the operator surfaces are session-only on purpose — see
   * `isAdminSession` — so that a leaked PAT cannot widen its own privileges. Without
   * a record of where a cookie came from, the exchange would launder token authority
   * into session authority and hand a token holder the one thing that check exists to
   * deny: minting further tokens. Carrying it in the signed payload (rather than
   * checking the admin list at exchange time) is what makes the property hold no
   * matter when an account joins that list.
   *
   * Absent on every cookie minted before this field existed, and those all read as
   * ordinary sessions. Right for the Google ones; briefly wrong for any the exchange
   * handed out beforehand, which keep satisfying the session-only checks until they
   * expire. That window is one token lifetime (12h) and closes on its own; rotating
   * SESSION_SECRET at deploy closes it immediately, which is worth doing if a PAT for
   * an admin account was ever exchanged.
   */
  src?: 'token';
}

export class InvalidSessionError extends Error {
  constructor(message = 'invalid session token') {
    super(message);
    this.name = 'InvalidSessionError';
  }
}

export class GoogleAuthVerificationError extends Error {
  constructor(message = 'google token verification failed') {
    super(message);
    this.name = 'GoogleAuthVerificationError';
  }
}

export interface GoogleAuthPayload {
  sub: string;
  email?: string;
  // Whether Google has verified the email address — must be true before using
  // email for access-control decisions (e.g. private-beta email allowlist).
  emailVerified?: boolean;
  name?: string;
  picture?: string;
}

export interface GoogleAuthVerifier {
  verifyIdToken(idToken: string): Promise<GoogleAuthPayload>;
}

export class DefaultGoogleAuthVerifier implements GoogleAuthVerifier {
  private client: OAuth2Client;

  constructor(private clientId: string) {
    this.client = new OAuth2Client(clientId);
  }

  async verifyIdToken(idToken: string): Promise<GoogleAuthPayload> {
    if (!this.clientId) {
      throw new GoogleAuthVerificationError('GOOGLE_OAUTH_CLIENT_ID is not configured');
    }
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub) {
        throw new GoogleAuthVerificationError('missing sub in google payload');
      }
      return {
        sub: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified === true,
        name: payload.name,
        picture: payload.picture,
      };
    } catch (err: unknown) {
      if (err instanceof GoogleAuthVerificationError) throw err;
      throw new GoogleAuthVerificationError(err instanceof Error ? err.message : 'failed to verify token');
    }
  }
}

export function mintSessionToken(
  uid: string,
  secret: string,
  durationSeconds = DEFAULT_SESSION_DURATION_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
  source?: 'token',
): string {
  const payload: SessionPayload = {
    uid,
    iat: nowSeconds,
    exp: nowSeconds + durationSeconds,
    ...(source === 'token' ? { src: source } : {}),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function readSessionToken(
  token: string,
  secret: string,
  prevSecret?: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionPayload {
  const parts = token.split('.');
  if (parts.length !== 2) throw new InvalidSessionError('malformed session token');
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) throw new InvalidSessionError('malformed session token');

  const expectedSig = createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  let sigMatch =
    signature.length === expectedSig.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));

  if (!sigMatch && prevSecret) {
    const prevSig = createHmac('sha256', prevSecret).update(encodedPayload).digest('base64url');
    sigMatch = signature.length === prevSig.length && timingSafeEqual(Buffer.from(signature), Buffer.from(prevSig));
  }

  if (!sigMatch) {
    throw new InvalidSessionError('invalid session signature');
  }

  try {
    const raw = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const payload = JSON.parse(raw) as SessionPayload;
    if (typeof payload.uid !== 'string' || typeof payload.exp !== 'number') {
      throw new InvalidSessionError('invalid payload structure');
    }

    if (nowSeconds >= payload.exp) {
      throw new InvalidSessionError('session expired');
    }

    // Normalized to the one meaningful value rather than passed through: `src` feeds
    // an authorization decision, so anything that is not exactly 'token' must read as
    // "no claim made" instead of reaching a caller as an unexpected shape.
    return { ...payload, ...(payload.src === 'token' ? { src: 'token' as const } : { src: undefined }) };
  } catch (err) {
    if (err instanceof InvalidSessionError) throw err;
    throw new InvalidSessionError('failed to parse session payload');
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    needsSessionRenewal: boolean;
    /**
     * How `user` was authenticated. `null` when there is no user.
     *
     * Routes that must not be reachable with a long-lived automation credential —
     * the operator surfaces, and token issuance itself — check this rather than just
     * `user`, so a leaked token can never widen its own privileges.
     */
    authMethod: 'session' | 'token' | null;
  }
}

export interface AuthPluginOptions {
  store: Store;
  sessionSecret?: string;
  sessionSecretPrev?: string;
  googleClientId?: string;
  googleAuthVerifier?: GoogleAuthVerifier;
  /**
   * Sign in with Apple. Absent in every environment where the owner has not created a
   * Services ID yet, which is why `/api/auth/apple` answers 503 rather than assuming a
   * verifier exists — the store apps (mobile-app-plan.md M2, private ops repo) need this, guideline 4.8
   * requires it beside Google, and the web app gets it so an Apple-account creator can
   * still reach their games from a desktop.
   */
  appleAuthVerifier?: AppleAuthVerifier;
  // Private beta: when true, /api/auth/google rejects uids/emails not in the allowlists
  privateBeta?: boolean;
  betaAllowedUids?: Set<string>;
  betaAllowedEmails?: Set<string>;
  /**
   * Operators, so the session can say so.
   *
   * Nothing here is authorization — every operator route re-checks the same allowlist
   * itself. This is only how the *client* learns whether to draw a door it is allowed
   * through, and it exists because the alternative was probing an operator endpoint on
   * every page load and reading its 404 as "no": one console error per visit for
   * everybody who is not an operator, which is most people.
   */
  adminUids?: Set<string>;
  // Reviewer desk hint only; every review route re-checks.
  reviewerUids?: Set<string>;
  // Same clock as minting, or token-info's day count drifts.
  now?: () => number;
}

const GoogleAuthSchema = z.object({
  idToken: z.string().trim().min(1, 'idToken is required'),
  inviteCode: z.string().regex(BETA_INVITE_CODE_PATTERN, 'invalid invite code').optional(),
});

const AppleAuthSchema = z.object({
  idToken: z.string().trim().min(1, 'idToken is required'),
  inviteCode: z.string().regex(BETA_INVITE_CODE_PATTERN, 'invalid invite code').optional(),
  /**
   * Apple's ID token carries no name claim, ever. The display name arrives exactly once —
   * in the body of the *first* authorization, alongside the token — and Apple never sends
   * it again, so a client that drops it has permanently lost the creator's name.
   *
   * Client-asserted and therefore untrusted: it is a label, never an identifier, and
   * nothing authorizes on it. Bounded here so it cannot be used to write an unbounded
   * string into Firestore.
   */
  name: z.string().trim().max(80).optional(),
});

const WaitlistSchema = z.object({
  idToken: z.string().trim().min(1, 'idToken is required'),
  locale: z.string().trim().max(10).optional(),
  // Which provider minted `idToken`. Defaults to Google because every waitlist entry
  // predating Sign in with Apple came from there.
  provider: z.enum(['google', 'apple']).optional(),
});

const BetaInviteClaimSchema = z.object({
  code: z.string().regex(BETA_INVITE_CODE_PATTERN, 'invalid invite code'),
});

// Best-effort: a failed write must not break an allowed sign-in.
async function recordInviteAdmission(
  store: Store,
  request: FastifyRequest,
  entry: { uid: string; email?: string; name?: string; locale?: string },
): Promise<void> {
  try {
    await store.recordBetaInviteAdmission(entry);
  } catch (err) {
    request.log.error({ err, uid: entry.uid }, 'beta invite claimed but waitlist approval write failed');
  }
}

function isRateLimited(
  buckets: Map<string, number[]>,
  ip: string,
  currentTime: number,
  maxRequests: number,
  windowMs: number,
): boolean {
  const requests = (buckets.get(ip) ?? []).filter((timestamp) => currentTime - timestamp < windowMs);
  if (requests.length >= maxRequests) {
    buckets.set(ip, requests);
    return true;
  }

  requests.push(currentTime);
  buckets.set(ip, requests);
  return false;
}

export async function registerAuthPlugin(app: FastifyInstance, options: AuthPluginOptions): Promise<void> {
  const store = options.store;
  const isProd = process.env.NODE_ENV === 'production';

  const sessionSecret = options.sessionSecret ?? process.env.SESSION_SECRET;
  const googleClientId = options.googleClientId ?? process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
  const isAuthConfigured = Boolean(sessionSecret && (googleClientId || options.googleAuthVerifier)) || !isProd;

  const effectiveSessionSecret = sessionSecret ?? 'dev-session-secret-change-me';
  const adminUids = options.adminUids;
  const reviewerUids = options.reviewerUids;
  const sessionSecretPrev = options.sessionSecretPrev ?? process.env.SESSION_SECRET_PREV;
  const now = options.now ?? Date.now;

  const verifier = options.googleAuthVerifier ?? new DefaultGoogleAuthVerifier(googleClientId);

  // Gated independently of Google: Apple sign-in is configured the day the owner creates
  // a Services ID and not before, so until then `/api/auth/apple` must be an honest 503
  // rather than a route that fails deep inside token verification.
  const appleVerifier = options.appleAuthVerifier ?? createAppleAuthVerifierFromEnv();
  const isAppleConfigured =
    Boolean(options.appleAuthVerifier) || parseAppleClientIds(process.env.APPLE_CLIENT_IDS).length > 0;

  const authRateLimitWindowMs = 60 * 60 * 1000;
  const maxAuthRequestsPerWindow = 20;
  const authAttemptsByIp = new Map<string, number[]>();

  await app.register(cookie);

  const getSessionUser = async (
    request: FastifyRequest,
  ): Promise<{ user: User | null; needsRenewal: boolean; fromToken: boolean }> => {
    const cookieToken = request.cookies[SESSION_COOKIE_NAME];
    if (!cookieToken) return { user: null, needsRenewal: false, fromToken: false };

    try {
      const { uid, exp, src } = readSessionToken(cookieToken, effectiveSessionSecret, sessionSecretPrev);
      const user = await store.getUser(uid);
      if (!user || user.deletionScheduledFor) {
        return { user: null, needsRenewal: false, fromToken: false };
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      const needsRenewal = exp - nowSeconds < sessionRenewalThresholdSeconds(src);

      return { user, needsRenewal, fromToken: src === 'token' };
    } catch {
      return { user: null, needsRenewal: false, fromToken: false };
    }
  };

  /**
   * Resolve a personal access token from the Authorization header
   * (docs/agent-access-tokens.md).
   *
   * The checks themselves live in access-token-service.ts, shared with the browser
   * sign-in form, so the header and the form can never disagree about which tokens are
   * good. What is specific to this door is the question of which Bearer credentials are
   * even candidates: this API carries others that are not PATs (the build channel's
   * per-issue tokens, the scheduler's OIDC tokens), and the `gdpl_pat_` prefix check
   * inside the resolver is what keeps those out — they fall through untouched to the
   * handlers that do understand them.
   */
  const getAccessTokenUser = async (request: FastifyRequest): Promise<User | null> => {
    const bearer = readBearerToken(request.headers.authorization);
    if (!bearer) return null;
    return resolveAccessTokenUser(store, bearer);
  };

  app.decorateRequest('user', null);
  app.decorateRequest('needsSessionRenewal', false);
  app.decorateRequest('authMethod', null);

  app.addHook('onRequest', async (request) => {
    if (!isAuthConfigured) return;
    const { user, needsRenewal, fromToken } = await getSessionUser(request);
    if (!user) {
      // No cookie session — fall back to a personal access token. Deliberately second:
      // a browser that has both should be treated as the human it is.
      const tokenUser = await getAccessTokenUser(request);
      if (tokenUser) {
        request.user = tokenUser;
        request.authMethod = 'token';
      }
      // No `activeDays` write on this path, and that is the point: the list feeds the
      // creator-return metric, and an agent polling on a schedule would report perfect
      // retention for an account that is not a person.
      return;
    }

    request.user = user;
    request.needsSessionRenewal = needsRenewal;
    // A cookie minted from a PAT still reports 'token': the credential behind this
    // request is the token, and every session-only check must see that rather than
    // the cookie it was traded for.
    request.authMethod = fromToken ? 'token' : 'session';

    /**
     * Record that this account was active today.
     *
     * `lastLoginAt` cannot stand in for this: sessions last weeks, so a creator who
     * comes back every day still shows a single login and reads as never returning.
     * `withActiveDay` returns null when today is already the newest entry, so the
     * common case costs no write at all — and a failure here must never turn a
     * working request into an error, hence the swallow.
     */
    const today = new Date().toISOString().slice(0, 10);
    const activeDays = withActiveDay(user.activeDays, today);
    if (activeDays) {
      void store.upsertUser({ uid: user.uid, activeDays }).catch(() => {
        /* activity history is best-effort, like every other measurement */
      });
    }
  });

  app.addHook('onSend', async (request, reply) => {
    if (isAuthConfigured && request.user && request.needsSessionRenewal && request.user.tier !== 'blocked') {
      // Provenance survives renewal, or a token-derived cookie would quietly become a
      // genuine one after six hours and regain exactly the authority it was denied.
      // `needsSessionRenewal` is only ever set on the cookie path, so 'token' here
      // means a token-derived session rather than a bare Bearer request.
      const source = request.authMethod === 'token' ? 'token' : undefined;
      const durationSeconds = sessionDurationSeconds(source);
      const renewedToken = mintSessionToken(
        request.user.uid,
        effectiveSessionSecret,
        durationSeconds,
        undefined,
        source,
      );
      reply.setCookie(SESSION_COOKIE_NAME, renewedToken, {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: durationSeconds,
      });
    }
  });

  app.post(
    '/api/auth/google',
    { config: { rateLimit: { max: maxAuthRequestsPerWindow, timeWindow: authRateLimitWindowMs } } },
    async (request, reply) => {
      if (!isAuthConfigured) {
        return reply.status(503).send({ error: 'authentication is not configured' });
      }

      const currentTime = Date.now();
      if (isRateLimited(authAttemptsByIp, request.ip, currentTime, maxAuthRequestsPerWindow, authRateLimitWindowMs)) {
        return reply.status(429).send({ error: 'too many login attempts, please try again later' });
      }

      const parseResult = GoogleAuthSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: parseResult.error.issues[0]?.message ?? 'invalid request' });
      }

      try {
        const googleUser = await verifier.verifyIdToken(parseResult.data.idToken);
        const uid = `g:${googleUser.sub}`;
        const existingUser = await store.getUser(uid);

        // Private-beta allowlist check — before creating/upserting the user doc so
        // rejected sign-ins leave no trace in Firestore. Allow if uid OR verified email matches.
        // NOTE: email is only consulted when Google has verified it (email_verified === true);
        // an unverified email claim must never satisfy an access-control allowlist.
        if (options.privateBeta) {
          const emailLower = googleUser.emailVerified && googleUser.email ? googleUser.email.toLowerCase() : '';
          if (existingUser?.tier === 'blocked') {
            return reply.status(403).send({ error: 'account is blocked' });
          }
          const allowlisted =
            (options.betaAllowedUids?.has(uid) ?? false) ||
            (emailLower !== '' && (options.betaAllowedEmails?.has(emailLower) ?? false)) ||
            (await store.isWaitlistApproved(uid, emailLower));
          const inviteClaim =
            parseResult.data.inviteCode === undefined
              ? null
              : await store.claimBetaInvite(parseResult.data.inviteCode, uid);
          const allowed = allowlisted || inviteClaim?.ok === true;
          if (!allowed) {
            // Look up existing waitlist status so the client can show it
            const waitlistEntry = await store.getWaitlistEntry(uid);
            return reply.status(403).send({
              error:
                parseResult.data.inviteCode === undefined
                  ? 'private beta — sign-ups are closed'
                  : 'beta invite is invalid or already used',
              waitlistStatus: waitlistEntry?.status ?? null,
            });
          }
          if (inviteClaim?.ok === true) {
            const claimLocale = localeFromRequest(request);
            await recordInviteAdmission(store, request, {
              uid,
              // Verified-only: an unverified address would admit its real owner.
              ...(emailLower !== '' ? { email: emailLower } : {}),
              ...(googleUser.name ? { name: googleUser.name } : {}),
              ...(claimLocale ? { locale: claimLocale } : {}),
            });
          }
        }

        await store.cancelAccountDeletion(uid);
        const signInLocale = localeFromRequest(request);
        const user = await store.upsertUser({
          uid,
          email: googleUser.email,
          name: googleUser.name,
          picture: googleUser.picture,
          ...(signInLocale ? { locale: signInLocale } : {}),
        });

        if (user.tier === 'blocked') {
          return reply.status(403).send({ error: 'account is blocked' });
        }

        const sessionToken = mintSessionToken(uid, effectiveSessionSecret);

        reply.setCookie(SESSION_COOKIE_NAME, sessionToken, {
          path: '/',
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          maxAge: DEFAULT_SESSION_DURATION_SECONDS,
        });

        return sessionPayload(user, {
          admin: isAdmin(user.uid, adminUids),
          reviewer: isReviewer(user.uid, reviewerUids, adminUids),
          betaWelcome: existingUser === null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'google token verification failed';
        return reply.status(401).send({ error: message });
      }
    },
  );

  /**
   * Sign in with Apple.
   *
   * Same shape as `/api/auth/google` — verify a provider token, apply the beta allowlist,
   * mint the same session cookie — and deliberately a separate route rather than a
   * `provider` branch inside that one, because the two differ in every detail that
   * matters: which claims exist, which of them are trustworthy, and whether the resulting
   * identity is allowed to be new (see `resolveAppleAccount`).
   */
  app.post(
    '/api/auth/apple',
    { config: { rateLimit: { max: maxAuthRequestsPerWindow, timeWindow: authRateLimitWindowMs } } },
    async (request, reply) => {
      if (!isAuthConfigured) {
        return reply.status(503).send({ error: 'authentication is not configured' });
      }
      if (!isAppleConfigured) {
        return reply.status(503).send({ error: 'sign in with apple is not configured' });
      }

      const currentTime = Date.now();
      if (isRateLimited(authAttemptsByIp, request.ip, currentTime, maxAuthRequestsPerWindow, authRateLimitWindowMs)) {
        return reply.status(429).send({ error: 'too many login attempts, please try again later' });
      }

      const parseResult = AppleAuthSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: parseResult.error.issues[0]?.message ?? 'invalid request' });
      }

      try {
        const applePayload = await appleVerifier.verifyIdToken(parseResult.data.idToken);

        // Resolves onto the creator's existing Google account when the verified,
        // non-relay address matches exactly one. Reads only — nothing is written until
        // the allowlist below has had its say.
        const resolution = await resolveAppleAccount(store, applePayload);
        const uid = resolution.uid;
        const existingUser = await store.getUser(uid);

        // Identical rule to the Google path, run against the *resolved* uid: a creator
        // already on the allowlist by their Google uid must not be turned away for
        // arriving through a different button.
        if (options.privateBeta) {
          const emailLower = resolution.email?.toLowerCase() ?? '';
          if (existingUser?.tier === 'blocked') {
            return reply.status(403).send({ error: 'account is blocked' });
          }
          const allowlisted =
            (options.betaAllowedUids?.has(uid) ?? false) ||
            (emailLower !== '' && (options.betaAllowedEmails?.has(emailLower) ?? false)) ||
            (await store.isWaitlistApproved(uid, emailLower));
          const inviteClaim =
            parseResult.data.inviteCode === undefined
              ? null
              : await store.claimBetaInvite(parseResult.data.inviteCode, uid);
          const allowed = allowlisted || inviteClaim?.ok === true;
          if (!allowed) {
            const waitlistEntry = await store.getWaitlistEntry(uid);
            return reply.status(403).send({
              error:
                parseResult.data.inviteCode === undefined
                  ? 'private beta — sign-ups are closed'
                  : 'beta invite is invalid or already used',
              waitlistStatus: waitlistEntry?.status ?? null,
            });
          }
          if (inviteClaim?.ok === true) {
            const claimLocale = localeFromRequest(request);
            await recordInviteAdmission(store, request, {
              uid,
              // Already the verified, linkable address — never a relay alias.
              ...(emailLower !== '' ? { email: emailLower } : {}),
              ...(parseResult.data.name ? { name: parseResult.data.name } : {}),
              ...(claimLocale ? { locale: claimLocale } : {}),
            });
          }
        }

        await store.cancelAccountDeletion(uid);
        const signInLocale = localeFromRequest(request);
        const user = await store.upsertUser({
          uid,
          // Only ever the linkable address. Writing a relay address here would overwrite a
          // linked account's real email with a forwarding alias, breaking the notification
          // emails that account already receives.
          email: resolution.email,
          // Apple sends the name once and never again, so an absent one must leave any
          // stored name alone — which `upsertUser` already does for undefined.
          name: parseResult.data.name || undefined,
          ...(signInLocale ? { locale: signInLocale } : {}),
        });

        if (user.tier === 'blocked') {
          return reply.status(403).send({ error: 'account is blocked' });
        }

        if (resolution.linkedTo) {
          request.log.info(
            { appleSub: applePayload.sub, linkedUid: uid },
            'apple sign-in linked to an existing account by verified email',
          );
        }

        reply.setCookie(SESSION_COOKIE_NAME, mintSessionToken(uid, effectiveSessionSecret), {
          path: '/',
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          maxAge: DEFAULT_SESSION_DURATION_SECONDS,
        });

        return sessionPayload(user, {
          admin: isAdmin(user.uid, adminUids),
          reviewer: isReviewer(user.uid, reviewerUids, adminUids),
          betaWelcome: existingUser === null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'apple token verification failed';
        return reply.status(401).send({ error: message });
      }
    },
  );

  // Deliberately usable WITHOUT a session — the caller is by definition someone
  // whose sign-in was just rejected (not on the private-beta allowlist). Shares
  // the auth rate limiter since it's the same abuse surface (unauthenticated
  // Google-token verification). Re-verifies the token server-side rather than
  // trusting any client-asserted identity.
  app.post(
    '/api/waitlist',
    { config: { rateLimit: { max: maxAuthRequestsPerWindow, timeWindow: authRateLimitWindowMs } } },
    async (request, reply) => {
      if (!isAuthConfigured) {
        return reply.status(503).send({ error: 'authentication is not configured' });
      }

      const currentTime = Date.now();
      if (isRateLimited(authAttemptsByIp, request.ip, currentTime, maxAuthRequestsPerWindow, authRateLimitWindowMs)) {
        return reply.status(429).send({ error: 'too many requests, please try again later' });
      }

      const parseResult = WaitlistSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: parseResult.error.issues[0]?.message ?? 'invalid request' });
      }

      try {
        // An Apple user whose sign-in was just refused needs the same door as a Google
        // one. Without this branch the beta's only way in is a Google account, which
        // makes the Apple button a dead end for exactly the people it was added for.
        let uid: string;
        let email: string | undefined;
        let name: string | undefined;

        if (parseResult.data.provider === 'apple') {
          if (!isAppleConfigured) {
            return reply.status(503).send({ error: 'sign in with apple is not configured' });
          }
          const applePayload = await appleVerifier.verifyIdToken(parseResult.data.idToken);
          const resolution = await resolveAppleAccount(store, applePayload);
          uid = resolution.uid;
          // Already excludes unverified and relay addresses. A relay address on the
          // waitlist would be a row the owner cannot recognise when approving.
          email = resolution.email;
        } else {
          const googleUser = await verifier.verifyIdToken(parseResult.data.idToken);
          uid = `g:${googleUser.sub}`;
          // Same rule as the beta allowlist: an unverified email claim must never be stored.
          email = googleUser.emailVerified && googleUser.email ? googleUser.email : undefined;
          name = googleUser.name;
        }

        const entry = await store.upsertWaitlistEntry({
          uid,
          email,
          name,
          locale: parseResult.data.locale,
        });

        // Operators need to know a person is waiting — otherwise the waitlist is a
        // Firestore collection nobody opens. Best-effort: a notification failure must
        // not turn a successful join into a 500. Idempotent per applicant uid.
        const adminUids = options.adminUids;
        if (adminUids && adminUids.size > 0) {
          const title = (name && name.trim()) || email || 'Someone';
          try {
            await emitWaitlistJoined(
              {
                store,
                mailer: process.env.RESEND_API_KEY ? createMailerFromEnv() : undefined,
                pusher: createPusherFromEnv(),
                adminUids,
                logError: (err, msg) => request.log.error({ err }, msg),
              },
              { uid, title, ...(email ? { email } : {}) },
            );
          } catch (err) {
            request.log.error({ err }, 'waitlist operator notify failed');
          }
        }

        return { status: 'ok', waitlistStatus: entry.status };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'token verification failed';
        return reply.status(401).send({ error: message });
      }
    },
  );

  app.post(
    '/api/beta-invites/claim',
    { config: { rateLimit: { max: maxAuthRequestsPerWindow, timeWindow: authRateLimitWindowMs } } },
    async (request, reply) => {
      if (request.authMethod !== 'session' || !request.user) {
        return reply.status(401).send({ error: 'authentication required' });
      }
      const parsed = BetaInviteClaimSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const result = await store.claimBetaInvite(parsed.data.code, request.user.uid);
      if (!result.ok) {
        return reply.status(409).send({ error: 'beta invite is invalid or already used' });
      }
      // No email here: only the uid was actually proven.
      await recordInviteAdmission(store, request, {
        uid: request.user.uid,
        ...(request.user.name ? { name: request.user.name } : {}),
        ...(request.user.locale ? { locale: request.user.locale } : {}),
      });
      return { status: 'claimed' };
    },
  );

  /**
   * Exchange a personal access token for a session cookie (docs/agent-access-tokens.md).
   *
   * Needed because the web app authenticates with cookies: an agent can call the API all
   * day with a Bearer header, but the moment it drives a real browser against the real
   * site — which is the entire point of the feature — it needs the credential the SPA
   * actually sends. Without this, testing the product would mean reimplementing the
   * product's fetch layer.
   *
   * Not a new privilege and not a bypass: the caller must already hold a valid token for
   * the account, and what comes back is a session for that same account carrying the same
   * authority the token had. It is the same shape as `/api/auth/google` — verify a
   * credential the caller already has, hand back the cookie the browser needs.
   *
   * That "same authority" is enforced, not assumed: the cookie is stamped `src: 'token'`
   * so the session-only operator surfaces keep refusing it. Without the stamp this route
   * was a real escalation — a leaked PAT for an admin account could be traded for a
   * cookie that satisfied `isAdminSession` and then mint further tokens, which is exactly
   * the self-renewing credential the token design exists to prevent.
   *
   * Session auth is deliberately *not* accepted here: a cookie cannot be used to mint a
   * fresh cookie, so this can never be used to launder an about-to-expire session.
   */
  app.post(
    '/api/auth/session',
    { config: { rateLimit: { max: maxAuthRequestsPerWindow, timeWindow: authRateLimitWindowMs } } },
    async (request, reply) => {
      if (!isAuthConfigured) {
        return reply.status(503).send({ error: 'authentication is not configured' });
      }

      // Resolved from the Authorization header rather than read off `request.authMethod`:
      // a cookie minted *here* also reports 'token', so trusting the method alone would
      // let a derived cookie mint an endless succession of fresh ones — self-renewing
      // past the revocation of the very PAT it came from, and reopening the "a cookie
      // cannot mint a cookie" hole this route is documented to close. The exchange has
      // to be driven by the credential itself, every time.
      const tokenUser = await getAccessTokenUser(request);
      if (!tokenUser) {
        return reply.status(401).send({ error: 'a personal access token is required' });
      }

      if (tokenUser.tier === 'blocked') {
        return reply.status(403).send({ error: 'account is blocked' });
      }

      // Stamped with its provenance so it stays a token's authority in cookie form:
      // the session-only operator surfaces refuse it exactly as they refuse the
      // Bearer header it was traded for. Everything the SPA actually needs a cookie
      // for — which is the whole point of this route — works unchanged.
      reply.setCookie(
        SESSION_COOKIE_NAME,
        mintSessionToken(tokenUser.uid, effectiveSessionSecret, TOKEN_SESSION_DURATION_SECONDS, undefined, 'token'),
        {
          path: '/',
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          maxAge: TOKEN_SESSION_DURATION_SECONDS,
        },
      );

      return { user: tokenUser };
    },
  );

  // Local development sign-in. Real Google OAuth needs a client ID, a consent screen and
  // an authorized origin, none of which a first-time contributor has — so without this the
  // entire authenticated half of the product (creating, revising, notifications) is
  // unreachable on a laptop, and the only workaround was minting a session token by hand
  // the way the tests do.
  //
  // It mints a session for a synthetic account with no credential of any kind, so it must
  // never exist in production. NODE_ENV is the gate, and the route answers 404 there rather
  // than 403: a deployment that somehow reached this line should not even advertise it.
  // The uid is namespaced `dev:` so it can never collide with a Google `g:` identity.
  app.post('/api/auth/dev', async (request, reply) => {
    if (isProd) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = z
      .object({
        uid: z
          .string()
          .trim()
          .regex(/^[a-z0-9-]{1,40}$/, 'invalid dev uid')
          .optional(),
      })
      .safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }

    const handle = parsed.data.uid ?? 'local';
    const uid = `dev:${handle}`;

    await store.cancelAccountDeletion(uid);
    const existingUser = await store.getUser(uid);
    const user = await store.upsertUser({
      uid,
      email: `${handle}@localhost`,
      name: `Local ${handle}`,
    });

    if (user.tier === 'blocked') {
      return reply.status(403).send({ error: 'account is blocked' });
    }

    reply.setCookie(SESSION_COOKIE_NAME, mintSessionToken(uid, effectiveSessionSecret), {
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: DEFAULT_SESSION_DURATION_SECONDS,
    });

    return sessionPayload(user, {
      admin: isAdmin(user.uid, adminUids),
      reviewer: isReviewer(user.uid, reviewerUids, adminUids),
      betaWelcome: existingUser === null,
    });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { status: 'ok' };
  });

  // Bearer only: token records are kept off the User object.

  // Expiry is mandatory and arrives as a cliff; this warns early.
  app.get('/api/auth/token-info', async (request, reply) => {
    if (!isAuthConfigured) {
      return reply.status(503).send({ error: 'authentication is not configured' });
    }
    const bearer = readBearerToken(request.headers.authorization);
    const record = bearer ? await resolveAccessTokenRecord(store, bearer) : null;
    // One answer for absent, malformed, unknown, revoked and expired alike.
    if (!record) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const expiresAtMs = Date.parse(record.expiresAt);
    return {
      name: record.name,
      expiresAt: record.expiresAt,
      // Floor, so "1" never means "expires in ninety minutes".
      expiresInDays: Math.floor((expiresAtMs - now()) / (24 * 60 * 60 * 1000)),
    };
  });

  app.get('/api/auth/me', async (request, reply) => {
    if (!isAuthConfigured) {
      return reply.status(503).send({ error: 'authentication is not configured' });
    }
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    if (request.user.tier === 'blocked') {
      return reply.status(403).send({ error: 'account is blocked' });
    }
    // PAT sessions never expose operator or reviewer doors.
    return sessionPayload(request.user, {
      admin: isAdminSession(request, adminUids),
      reviewer: isReviewerSession(request, reviewerUids, adminUids),
    });
  });
}

/**
 * The session as the client is told it. Adds derived flags to the stored user.
 *
 * `admin` and `reviewer` appear only when true.
 */
function sessionPayload(
  user: User,
  flags: { admin?: boolean; reviewer?: boolean; betaWelcome?: boolean },
): { user: User & { admin?: true; reviewer?: true }; betaWelcome?: true } {
  const next: User & { admin?: true; reviewer?: true } = { ...user };
  if (flags.admin) next.admin = true;
  if (flags.reviewer) next.reviewer = true;
  return { user: next, ...(flags.betaWelcome ? { betaWelcome: true as const } : {}) };
}

export function checkUserAccess(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!request.user) {
    reply.status(401).send({ error: 'authentication required' });
    return false;
  }
  if (request.user.tier === 'blocked') {
    reply.status(403).send({ error: 'account is blocked' });
    return false;
  }
  return true;
}
