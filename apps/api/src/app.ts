import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { GameGenerator } from '@gamedevpl/game-generator';
import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assembleGameHtml, CredentialLeakError, EmptyProjectError, ProjectTooLargeError } from './assemble.js';
import { registerAuthPlugin, type GoogleAuthVerifier } from './auth.js';
import { createGenerator } from './generator.js';
import { InMemoryStore, type Store } from './store.js';
import { registerSubmissionRoutes, type SubmissionRoutesOptions } from './submissions.js';

const GenerateRequestSchema = z.object({
  prompt: z.string().trim().min(1, 'prompt is required').max(500, 'prompt is too long'),
});

export interface BuildAppOptions {
  generator?: GameGenerator;
  logger?: boolean;
  store?: Store;
  sessionSecret?: string;
  sessionSecretPrev?: string;
  googleClientId?: string;
  googleAuthVerifier?: GoogleAuthVerifier;
  dailyGenerationQuota?: number;
  submissionRoutes?: SubmissionRoutesOptions;
  // Private beta allowlist — uids (comma-separated) allowed to sign in and access gated routes
  betaAllowedUids?: string;
  // Private beta allowlist — Google-verified emails (comma-separated, case-insensitive)
  betaAllowedEmails?: string;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const generator = options.generator ?? createGenerator();
  const app = Fastify({ logger: options.logger ?? false });
  const store = options.store ?? new InMemoryStore();
  const dailyGenerationQuota = options.dailyGenerationQuota ?? Number(process.env.DAILY_GENERATION_QUOTA ?? '20');

  const isProd = process.env.NODE_ENV === 'production';
  const webOrigin = process.env.WEB_ORIGIN?.trim();

  // In production, WEB_ORIGIN pins CORS to the deployed site (e.g. https://www.gamedev.pl);
  // a comma-separated list is allowed. When unset in prod, origin is false (disabling cross-origin
  // requests, while allowing same-origin SPA traffic). In dev, origin defaults to true.
  await app.register(cors, {
    origin: webOrigin ? webOrigin.split(',').map((entry) => entry.trim()) : isProd ? false : true,
    credentials: true,
  });

  // Private beta controls. When PRIVATE_BETA=true, all data routes require a session
  // and sign-in is restricted to uids/emails in the allowlist.
  // Flip to false (config, not code) to open the site. Tests/dev default to false.
  const privateBeta =
    options.betaAllowedUids !== undefined || options.betaAllowedEmails !== undefined
      ? true // explicit test injection implies beta mode
      : (process.env.PRIVATE_BETA ?? '').toLowerCase() === 'true';

  const betaAllowedUids = new Set(
    (options.betaAllowedUids ?? process.env.BETA_ALLOWED_UIDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const betaAllowedEmails = new Set(
    (options.betaAllowedEmails ?? process.env.BETA_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  // Auth plugin registers cookies, /api/auth/* endpoints, and user session decorator.
  // The private-beta allowlist is enforced inside the plugin on /api/auth/google.
  await registerAuthPlugin(app, {
    store,
    sessionSecret: options.sessionSecret,
    sessionSecretPrev: options.sessionSecretPrev,
    googleClientId: options.googleClientId,
    googleAuthVerifier: options.googleAuthVerifier,
    privateBeta,
    betaAllowedUids,
    betaAllowedEmails,
  });

  await registerSubmissionRoutes(app, {
    ...options.submissionRoutes,
    store,
  });

  app.get('/api/health', async () => ({ status: 'ok', provider: generator.name }));

  app.get('/api/version', async () => ({ name: 'gamedev-pl', version: '0.0.0' }));

  // In private-beta mode all data reads require a session so the app is usable only after sign-in.
  // /api/health and /api/auth/* stay public (probes + login flow).
  app.addHook('onRequest', async (request, reply) => {
    if (!privateBeta) return;
    if (request.url === '/api/health' || request.url.startsWith('/api/auth')) return;
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
  });

  app.post('/api/generate-game', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }

    // 1. Validate request payload first so malformed requests don't burn daily quota
    const parsedRequest = GenerateRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return reply.status(400).send({ error: parsedRequest.error.issues[0]?.message ?? 'invalid request' });
    }

    // 2. Daily user generation quota check
    const dateStr = new Date().toISOString().slice(0, 10);
    const quota = await store.checkAndIncrementQuota(request.user.uid, dateStr, dailyGenerationQuota, 'mocks');
    if (!quota.allowed) {
      if (quota.tier === 'blocked') {
        return reply.status(403).send({ error: 'account is blocked' });
      }
      return reply.status(429).send({ error: 'daily generation quota exceeded' });
    }

    const project = await generator.generate(parsedRequest.data.prompt);

    // Generated code isn't schema-validatable — the client runs it in a sandboxed
    // iframe. We only assemble it into one document and enforce basic hygiene here.
    try {
      const html = assembleGameHtml(project);
      return { title: project.title, description: project.description, html };
    } catch (error) {
      if (
        error instanceof EmptyProjectError ||
        error instanceof ProjectTooLargeError ||
        error instanceof CredentialLeakError
      ) {
        request.log.error({ err: error }, 'generated project failed hygiene checks');
        return reply.status(502).send({ error: 'game generation failed' });
      }
      throw error;
    }
  });

  // In production (single Cloud Run service) the API also serves the built web app from the
  // same origin, so the browser makes only same-origin requests and no CORS is involved.
  // WEB_DIST_DIR points at apps/web/dist; unset in local dev, where Vite serves the app.
  const webDistDir = process.env.WEB_DIST_DIR?.trim();
  if (webDistDir && existsSync(webDistDir)) {
    await app.register(fastifyStatic, { root: webDistDir, wildcard: false });
    // SPA fallback: any non-/api GET that isn't a real file returns index.html
    // (the app is hash-routed, so this mainly covers a hard refresh on any path).
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api')) {
        return reply.status(404).send({ error: 'not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
