import { createHmac, timingSafeEqual } from 'node:crypto';
import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { withActiveDay, type Store, type User } from './store.js';

export const SESSION_COOKIE_NAME = 'gamedev_session';
export const DEFAULT_SESSION_DURATION_SECONDS = 12 * 60 * 60; // 12 hours
export const HALF_LIFE_SECONDS = 6 * 60 * 60; // 6 hours (sliding renewal threshold)

export interface SessionPayload {
  uid: string;
  iat: number;
  exp: number;
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
): string {
  const payload: SessionPayload = {
    uid,
    iat: nowSeconds,
    exp: nowSeconds + durationSeconds,
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

    return payload;
  } catch (err) {
    if (err instanceof InvalidSessionError) throw err;
    throw new InvalidSessionError('failed to parse session payload');
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    needsSessionRenewal: boolean;
  }
}

export interface AuthPluginOptions {
  store: Store;
  sessionSecret?: string;
  sessionSecretPrev?: string;
  googleClientId?: string;
  googleAuthVerifier?: GoogleAuthVerifier;
  // Private beta: when true, /api/auth/google rejects uids/emails not in the allowlists
  privateBeta?: boolean;
  betaAllowedUids?: Set<string>;
  betaAllowedEmails?: Set<string>;
}

const GoogleAuthSchema = z.object({
  idToken: z.string().trim().min(1, 'idToken is required'),
});

const WaitlistSchema = z.object({
  idToken: z.string().trim().min(1, 'idToken is required'),
  locale: z.string().trim().max(10).optional(),
});

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
  const sessionSecretPrev = options.sessionSecretPrev ?? process.env.SESSION_SECRET_PREV;

  const verifier = options.googleAuthVerifier ?? new DefaultGoogleAuthVerifier(googleClientId);

  const authRateLimitWindowMs = 60 * 60 * 1000;
  const maxAuthRequestsPerWindow = 20;
  const authAttemptsByIp = new Map<string, number[]>();

  await app.register(cookie);

  const getSessionUser = async (request: FastifyRequest): Promise<{ user: User | null; needsRenewal: boolean }> => {
    const cookieToken = request.cookies[SESSION_COOKIE_NAME];
    if (!cookieToken) return { user: null, needsRenewal: false };

    try {
      const { uid, exp } = readSessionToken(cookieToken, effectiveSessionSecret, sessionSecretPrev);
      const user = await store.getUser(uid);
      if (!user) {
        return { user: null, needsRenewal: false };
      }

      const now = Math.floor(Date.now() / 1000);
      const needsRenewal = exp - now < HALF_LIFE_SECONDS;

      return { user, needsRenewal };
    } catch {
      return { user: null, needsRenewal: false };
    }
  };

  app.decorateRequest('user', null);
  app.decorateRequest('needsSessionRenewal', false);

  app.addHook('onRequest', async (request) => {
    if (!isAuthConfigured) return;
    const { user, needsRenewal } = await getSessionUser(request);
    if (user) {
      request.user = user;
      request.needsSessionRenewal = needsRenewal;

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
    }
  });

  app.addHook('onSend', async (request, reply) => {
    if (isAuthConfigured && request.user && request.needsSessionRenewal && request.user.tier !== 'blocked') {
      const renewedToken = mintSessionToken(request.user.uid, effectiveSessionSecret);
      reply.setCookie(SESSION_COOKIE_NAME, renewedToken, {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: DEFAULT_SESSION_DURATION_SECONDS,
      });
    }
  });

  app.post('/api/auth/google', { config: { rateLimit: { max: maxAuthRequestsPerWindow, timeWindow: authRateLimitWindowMs } } }, async (request, reply) => {
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

      // Private-beta allowlist check — before creating/upserting the user doc so
      // rejected sign-ins leave no trace in Firestore. Allow if uid OR verified email matches.
      // NOTE: email is only consulted when Google has verified it (email_verified === true);
      // an unverified email claim must never satisfy an access-control allowlist.
      if (options.privateBeta) {
        const emailLower = googleUser.emailVerified && googleUser.email ? googleUser.email.toLowerCase() : '';
        const allowed =
          (options.betaAllowedUids?.has(uid) ?? false) ||
          (emailLower !== '' && (options.betaAllowedEmails?.has(emailLower) ?? false)) ||
          (await store.isWaitlistApproved(uid, emailLower));
        if (!allowed) {
          // Look up existing waitlist status so the client can show it
          const waitlistEntry = await store.getWaitlistEntry(uid);
          return reply.status(403).send({
            error: 'private beta — sign-ups are closed',
            waitlistStatus: waitlistEntry?.status ?? null,
          });
        }
      }

      const user = await store.upsertUser({
        uid,
        email: googleUser.email,
        name: googleUser.name,
        picture: googleUser.picture,
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

      return { user };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'google token verification failed';
      return reply.status(401).send({ error: message });
    }
  });

  // Deliberately usable WITHOUT a session — the caller is by definition someone
  // whose sign-in was just rejected (not on the private-beta allowlist). Shares
  // the auth rate limiter since it's the same abuse surface (unauthenticated
  // Google-token verification). Re-verifies the token server-side rather than
  // trusting any client-asserted identity.
  app.post('/api/waitlist', { config: { rateLimit: { max: maxAuthRequestsPerWindow, timeWindow: authRateLimitWindowMs } } }, async (request, reply) => {
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
      const googleUser = await verifier.verifyIdToken(parseResult.data.idToken);
      const uid = `g:${googleUser.sub}`;
      // Same rule as the beta allowlist: an unverified email claim must never be stored.
      const email = googleUser.emailVerified && googleUser.email ? googleUser.email : undefined;

      const entry = await store.upsertWaitlistEntry({
        uid,
        email,
        name: googleUser.name,
        locale: parseResult.data.locale,
      });

      return { status: 'ok', waitlistStatus: entry.status };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'google token verification failed';
      return reply.status(401).send({ error: message });
    }
  });

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

    return { user };
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { status: 'ok' };
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
    return { user: request.user };
  });
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
