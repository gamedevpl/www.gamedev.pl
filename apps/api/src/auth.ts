import { createHmac, timingSafeEqual } from 'node:crypto';
import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { Store, User } from './store.js';

export const SESSION_COOKIE_NAME = 'gamedev_session';
const DEFAULT_SESSION_DURATION_SECONDS = 12 * 3600; // 12 hours
const HALF_LIFE_SECONDS = 6 * 3600; // 6 hours

export class InvalidSessionError extends Error {
  constructor(message = 'invalid session') {
    super(message);
    this.name = 'InvalidSessionError';
  }
}

export interface SessionPayload {
  uid: string;
  exp: number;
}

function signPayload(payloadStr: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadStr).digest('hex');
}

export function mintSessionToken(
  uid: string,
  secret: string,
  durationSeconds: number = DEFAULT_SESSION_DURATION_SECONDS,
): string {
  const exp = Math.floor(Date.now() / 1000) + durationSeconds;
  const payloadStr = `${uid}:${exp}`;
  const signature = signPayload(payloadStr, secret);
  const tokenRaw = `${payloadStr}.${signature}`;
  return Buffer.from(tokenRaw, 'utf8').toString('base64url');
}

export function verifySessionToken(token: string, secret: string, prevSecret?: string): SessionPayload {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length !== 2) {
      throw new InvalidSessionError();
    }

    const [payloadStr, signature] = parts;
    if (!payloadStr || !signature || !/^[a-f0-9]{64}$/i.test(signature)) {
      throw new InvalidSessionError();
    }

    const lastColonIdx = payloadStr.lastIndexOf(':');
    if (lastColonIdx <= 0) {
      throw new InvalidSessionError();
    }

    const uid = payloadStr.slice(0, lastColonIdx);
    const expRaw = payloadStr.slice(lastColonIdx + 1);
    const exp = Number.parseInt(expRaw, 10);

    if (!uid || !Number.isSafeInteger(exp)) {
      throw new InvalidSessionError();
    }

    const now = Math.floor(Date.now() / 1000);
    if (exp <= now) {
      throw new InvalidSessionError('session expired');
    }

    const verifyWith = (key: string): boolean => {
      const expected = signPayload(payloadStr, key);
      const actualBuffer = Buffer.from(signature, 'utf8');
      const expectedBuffer = Buffer.from(expected, 'utf8');
      return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
    };

    let valid = verifyWith(secret);
    if (!valid && prevSecret) {
      valid = verifyWith(prevSecret);
    }

    if (!valid) {
      throw new InvalidSessionError();
    }

    return { uid, exp };
  } catch (error) {
    if (error instanceof InvalidSessionError) throw error;
    throw new InvalidSessionError();
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
    needsSessionRenewal?: boolean;
  }
}

export interface GoogleAuthVerifier {
  verifyIdToken(idToken: string): Promise<{ sub: string; email?: string; name?: string; picture?: string }>;
}

export class DefaultGoogleAuthVerifier implements GoogleAuthVerifier {
  private client: OAuth2Client;
  private clientId: string;

  constructor(clientId: string) {
    if (!clientId && process.env.NODE_ENV === 'production') {
      throw new Error('GOOGLE_OAUTH_CLIENT_ID environment variable is required in production');
    }
    this.clientId = clientId;
    this.client = new OAuth2Client();
  }

  async verifyIdToken(idToken: string): Promise<{ sub: string; email?: string; name?: string; picture?: string }> {
    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: this.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      throw new Error('Invalid ID token payload');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  }
}

export interface AuthPluginOptions {
  store: Store;
  sessionSecret?: string;
  sessionSecretPrev?: string;
  googleClientId?: string;
  googleAuthVerifier?: GoogleAuthVerifier;
}

const GoogleAuthSchema = z.object({
  idToken: z.string().trim().min(1, 'idToken is required'),
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
  if (!sessionSecret && isProd) {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }
  const effectiveSessionSecret = sessionSecret ?? 'dev-session-secret-change-me';
  const sessionSecretPrev = options.sessionSecretPrev ?? process.env.SESSION_SECRET_PREV;

  const googleClientId = options.googleClientId ?? process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
  if (!googleClientId && !options.googleAuthVerifier && isProd) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID environment variable is required in production');
  }

  const verifier = options.googleAuthVerifier ?? new DefaultGoogleAuthVerifier(googleClientId);

  const authRateLimitWindowMs = 60 * 60 * 1000;
  const maxAuthRequestsPerWindow = 20;
  const authAttemptsByIp = new Map<string, number[]>();

  await app.register(cookie);

  const getSessionUser = async (request: FastifyRequest): Promise<{ user: User | null; needsRenewal: boolean }> => {
    const cookieToken = request.cookies[SESSION_COOKIE_NAME];
    if (!cookieToken) return { user: null, needsRenewal: false };

    try {
      const { uid, exp } = verifySessionToken(cookieToken, effectiveSessionSecret, sessionSecretPrev);
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
    const { user, needsRenewal } = await getSessionUser(request);
    if (user) {
      request.user = user;
      request.needsSessionRenewal = needsRenewal;
    }
  });

  app.addHook('onSend', async (request, reply) => {
    if (request.user && request.needsSessionRenewal && request.user.tier !== 'blocked') {
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

  app.post('/api/auth/google', async (request, reply) => {
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
      if (existingUser?.tier === 'blocked') {
        return reply.status(403).send({ error: 'account is blocked' });
      }

      const user = await store.upsertUser({
        uid,
        email: googleUser.email,
        name: googleUser.name,
        picture: googleUser.picture,
      });

      const sessionToken = mintSessionToken(uid, effectiveSessionSecret);

      reply.setCookie(SESSION_COOKIE_NAME, sessionToken, {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: DEFAULT_SESSION_DURATION_SECONDS,
      });

      return reply.send({ user });
    } catch (err) {
      request.log.error({ err }, 'Google ID token verification failed');
      return reply.status(401).send({ error: 'invalid google authentication' });
    }
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return reply.send({ status: 'ok' });
  });

  app.get('/api/auth/me', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    if (request.user.tier === 'blocked') {
      return reply.status(403).send({ error: 'account is blocked' });
    }
    return reply.send({ user: request.user });
  });
}

export function requireSession(request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void): void {
  if (!request.user) {
    reply.status(401).send({ error: 'authentication required' });
    return;
  }
  if (request.user.tier === 'blocked') {
    reply.status(403).send({ error: 'account is blocked' });
    return;
  }
  done();
}
