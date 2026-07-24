import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { GameGenerator } from '@gamedevpl/game-generator';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assembleGameHtml, CredentialLeakError, EmptyProjectError, ProjectTooLargeError } from './assemble.js';
import { registerAuthPlugin, type GoogleAuthVerifier } from './auth.js';
import { createGenerator } from './generator.js';
import { createDefaultContentChecker, type ContentChecker } from './moderation.js';
import { registerEmailRoutes } from './email-routes.js';
import { registerMultiplayerRoutes, type MultiplayerRoutesOptions } from './mp.js';
import { registerNotificationRoutes } from './notifications.js';
import { registerRefineRoute, type SpecRefiner } from './refine.js';
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
  contentChecker?: ContentChecker;
  specRefiner?: SpecRefiner;
  multiplayerRoutes?: MultiplayerRoutesOptions;
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

  const contentChecker = options.contentChecker ?? createDefaultContentChecker();

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
    contentChecker,
  });

  // Multiplayer room relay (docs/multiplayer-plan.md). Registered after the auth
  // plugin so /api/mp/sessions sees request.user, and before the beta wall hook
  // so the wall's /api/mp/ws exemption applies to a route that actually exists.
  await app.register(fastifyWebsocket, { options: { maxPayload: 4 * 1024 } });
  await registerMultiplayerRoutes(app, options.multiplayerRoutes);

  await registerRefineRoute(app, {
    store,
    contentChecker,
    specRefiner: options.specRefiner,
  });

  await registerNotificationRoutes(app, { store });

  await registerEmailRoutes(app, { store, unsubscribeSecret: options.sessionSecret });

  app.get('/api/health', async () => ({ status: 'ok', provider: generator.name, privateBeta }));

  app.get('/api/version', async () => ({ name: 'gamedev-pl', version: '0.0.0' }));

  // Apex → www canonical-host redirect. Cloud Run domain mappings can't emit a
  // 301, and both www.gamedev.pl and gamedev.pl terminate at this same service,
  // so we canonicalize here. When CANONICAL_HOST=www.gamedev.pl, a request whose
  // Host header is the bare apex (gamedev.pl) 301s to https://www.gamedev.pl +
  // same path. Only the exact apex is redirected — the run.app URL, localhost,
  // and the canonical host itself are untouched, so health probes, smoke tests,
  // and dev keep working. Unset (dev/tests) → no-op.
  const canonicalHost = process.env.CANONICAL_HOST?.trim();
  const apexHost = canonicalHost?.startsWith('www.') ? canonicalHost.slice(4) : undefined;
  if (canonicalHost && apexHost) {
    app.addHook('onRequest', async (request, reply) => {
      if (request.headers.host === apexHost) {
        return reply.redirect(`https://${canonicalHost}${request.url}`, 301);
      }
    });
  }

  // In private-beta mode all API data reads require a session so the app is usable only
  // after sign-in. IMPORTANT: the wall must gate only /api/* paths — the static SPA shell
  // must load freely so the visitor can reach the sign-in button (chicken-and-egg otherwise).
  // /api/health, /api/auth/*, and /api/waitlist stay public within the API (probes, login
  // flow, and the waitlist — which by definition serves people who just failed sign-in).
  app.addHook('onRequest', async (request, reply) => {
    if (!privateBeta) return;
    if (!request.url.startsWith('/api/')) return; // static shell always passes through
    if (request.url === '/api/health' || request.url.startsWith('/api/auth')) return;
    if (request.url.startsWith('/api/waitlist')) return;
    // The unsubscribe link carries a signed token and is clicked from a mail client
    // that has no session — it must reach its handler through the wall.
    if (request.url.startsWith('/api/email/unsubscribe')) return;
    // Internal endpoints (the Cloud Scheduler notification sweep) authenticate via
    // an OIDC token in the handler, not a session — the wall would 401 them first.
    if (request.url.startsWith('/api/internal/')) return;
    // The controller websocket is the one door anonymous guests may reach: a phone
    // that scanned a QR has no session and never will. It is useless without a
    // room token (verified in the first frame, not here), and the room it opens
    // was created by an allowlisted host. Everything else stays walled.
    if (request.url.startsWith('/api/mp/ws')) return;
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

    // 2. Content moderation, before any quota is spent (docs/content-safety-plan.md Layer 1 & 1b)
    const moderation = await contentChecker.check(parsedRequest.data.prompt);
    if (!moderation.allowed) {
      return reply.status(422).send({ error: 'content_rejected', category: moderation.category ?? 'other' });
    }

    // 3. Daily user generation quota check
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
    await app.register(fastifyStatic, {
      root: webDistDir,
      wildcard: false,
      // Serve build-time .br/.gz siblings (apps/web/scripts/precompress.mjs) —
      // never compress per-request: Cloud Run bills CPU.
      preCompressed: true,
      setHeaders: (reply, filePath) => {
        // Vite content-hashes everything under /assets/, so those URLs are
        // immutable; index.html is the rollout pivot and must revalidate.
        // Long-lived caching here is also what lets the CDN in front of the
        // service (docs/closed-beta-launch-plan.md) actually cache anything.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          reply.header('cache-control', 'public, max-age=31536000, immutable');
        } else {
          reply.header('cache-control', 'no-cache');
        }
      },
    });
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
