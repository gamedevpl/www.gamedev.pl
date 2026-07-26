import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { GameGenerator } from '@gamedevpl/game-generator';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assembleGameHtml, CredentialLeakError, EmptyProjectError, ProjectTooLargeError } from './assemble.js';
import { registerAccessTokenRoutes } from './access-token-routes.js';
import { registerAdminRoutes } from './admin.js';
import { registerAuthPlugin, type GoogleAuthVerifier } from './auth.js';
import { registerCreatorStudioRoutes } from './creator-studio.js';
import { createGenerator } from './generator.js';
import { createDefaultContentChecker, type ContentChecker } from './moderation.js';
import { registerContactRoutes, type ContactRoutesOptions } from './contact.js';
import { registerEmailRoutes } from './email-routes.js';
import { resolveLocalGamesDir } from './local-games-repo.js';
import { registerMultiplayerRoutes, type MultiplayerRoutesOptions } from './mp.js';
import { registerNotificationRoutes } from './notifications.js';
import { registerPlayerFeedbackRoutes, type PlayerFeedbackRoutesOptions } from './player-feedback.js';
import { registerPushRoutes } from './push-routes.js';
import { registerScorecardRoutes, type ScorecardRoutesOptions } from './scorecard.js';
import { createInternalAuthVerifierFromEnv } from './internal-auth.js';
import { registerRefineRoute, type SpecRefiner } from './refine.js';
import { InMemoryStore, type Store } from './store.js';
import { registerSubmissionRoutes, type SubmissionRoutesOptions } from './submissions.js';
import { mintToken } from './submission-token.js';
import { registerTelemetryRoutes, type TelemetryRoutesOptions } from './telemetry.js';
import { registerVisitTelemetryRoutes } from './visit-telemetry.js';
import { registerVoteRoutes, type VoteRoutesOptions } from './votes.js';
import { createPublishedSlugGateFromEnv } from './published-slugs.js';
import { registerRateLimit } from './rate-limit.js';
import { isKnownSpaShellPath, looksLikeStaticAsset } from './spa-paths.js';

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
  /** Seams for play-session telemetry; defaults to a live catalog-backed slug gate. */
  telemetryRoutes?: Omit<TelemetryRoutesOptions, 'store'>;
  /** Seams for game votes; defaults to a live catalog-backed slug gate. */
  voteRoutes?: Omit<VoteRoutesOptions, 'store'>;
  /** Seams for written player feedback; defaults to a live catalog-backed slug gate. */
  playerFeedbackRoutes?: Omit<PlayerFeedbackRoutesOptions, 'store' | 'contentChecker'>;
  /** Seams for the nightly scorecard sweep; defaults to OIDC-or-deny-all from env. */
  scorecardRoutes?: Partial<Omit<ScorecardRoutesOptions, 'store'>>;
  /** Seams for the public contact form (mailer fake in tests). */
  contactRoutes?: ContactRoutesOptions;
  // Private beta allowlist — uids (comma-separated) allowed to sign in and access gated routes
  betaAllowedUids?: string;
  // Private beta allowlist — Google-verified emails (comma-separated, case-insensitive)
  betaAllowedEmails?: string;
  // Uids (comma-separated) allowed to read the operator telemetry view
  adminUids?: string;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const generator = options.generator ?? createGenerator();
  // Cloud Run terminates the connection and proxies to this container, so without
  // trustProxy every request.ip is the proxy's own address (169.254.x.x) —
  // collapsing every per-IP rate limiter in the app into one shared, site-wide
  // bucket.
  //
  // The hop count matters and must not be `true`: Cloud Run *appends* the real
  // client IP to X-Forwarded-For rather than replacing it, so a client sending
  // `X-Forwarded-For: 1.2.3.4` produces "1.2.3.4, <real ip>". `true` trusts every
  // hop and takes the leftmost entry — letting any caller choose their own rate
  // limit bucket. Trusting exactly one hop resolves to the rightmost entry, which
  // is the only one Cloud Run itself wrote, so spoofed prefixes are ignored.
  const app = Fastify({ logger: options.logger ?? false, trustProxy: 1 });
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

  // IP rate limiting (opt-in per route via `{ config: { rateLimit } }`). Registered
  // before route plugins so annotated handlers are covered. Imported as
  // `fastify-rate-limit` so CodeQL's js/missing-rate-limiting model recognizes it.
  await registerRateLimit(app);

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

  const adminUids = new Set(
    (options.adminUids ?? process.env.ADMIN_UIDS ?? '')
      .split(',')
      .map((s) => s.trim())
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

  await registerPushRoutes(app, { store, vapidPublicKey: process.env.VAPID_PUBLIC_KEY?.trim() });

  await registerEmailRoutes(app, { store, unsubscribeSecret: options.sessionSecret });

  // Public contact form → admin@gamedev.pl. Exempted from the private-beta wall
  // below: a published contact point that only signed-in beta users can reach is
  // not a published contact point. Rate-limited and moderated in the handler.
  await registerContactRoutes(app, options.contactRoutes);

  // Play-session telemetry (docs/improvement-loop-plan.md IL-1). Deliberately *not*
  // exempted from the private-beta wall below: during closed beta every player is a
  // signed-in member, so the wall costs nothing and keeps the intake shut to the
  // open internet. Revisit when the site opens — the handler itself never reads
  // request.user and records nothing that identifies a player.
  //
  // One env-derived gate is shared by telemetry, votes, and written feedback: all
  // three ask the same question ("is this a published catalog slug?") and must not
  // drift. Call-site overrides still win via the spreads below.
  const envPublishedSlugs = await createPublishedSlugGateFromEnv();
  await registerTelemetryRoutes(app, {
    store,
    publishedSlugs: envPublishedSlugs,
    ...options.telemetryRoutes,
  });

  // Visit-level telemetry — the funnel before and between games. Exempted from the
  // private-beta wall below (unlike play telemetry): the whole point is the first
  // minute of a visit, which for most visitors is *before* sign-in — during closed
  // beta that is the "please sign in" splash itself. Walling it would silently zero
  // out exactly the acquisition and drop-off signal this stream exists to capture.
  // Safe to leave open: the handler never reads request.user and records nothing
  // that identifies a visitor, so it costs nothing to admit from the open internet.
  await registerVisitTelemetryRoutes(app, { store });

  // Thumbs up/down (docs/improvement-loop-plan.md, signal source #2). Casting or
  // clearing a vote needs a session (request.user), same as push subscriptions; the
  // count read does not, so a shared game link shows real numbers to a visitor who
  // has never signed in. `/api/games/` is already exempt from the beta wall below,
  // for the same reason play itself is: it is what a game link has to work through.
  await registerVoteRoutes(app, {
    store,
    publishedSlugs: envPublishedSlugs,
    ...options.voteRoutes,
  });

  // Written player feedback (docs/improvement-loop-plan.md, signal source #1). Keyed
  // by slug and gated the same way votes are; unlike votes it requires a session to
  // even read the tradeoff (there is no public read here — feedback has no public
  // aggregate view yet, that's IL-2's scorecard). See player-feedback.ts for why it
  // needs a session and why, unlike creator feedback, it never touches GitHub.
  await registerPlayerFeedbackRoutes(app, {
    store,
    contentChecker,
    publishedSlugs: envPublishedSlugs,
    ...options.playerFeedbackRoutes,
  });

  // Operator reads over that telemetry. Separate allowlist from the beta one: being
  // let into the closed beta is not the same as being allowed to read every game's
  // numbers. Unset means the route admits nobody, which is the right default for a
  // surface whose whole purpose is seeing across other people's games.
  await registerAdminRoutes(app, { store, adminUids });

  // The nightly Distill step (docs/improvement-loop-plan.md IL-2): rolls the telemetry
  // window plus vote/feedback counts into one scorecard per game. Authenticated by the
  // scheduler's OIDC token in the handler — the beta wall already exempts /api/internal/,
  // which is why the verifier and not the wall is what protects it.
  await registerScorecardRoutes(app, {
    store,
    internalAuthVerifier: createInternalAuthVerifierFromEnv(process.env, 'scorecardSweep'),
    ...options.scorecardRoutes,
  });

  // Issuing personal access tokens (docs/agent-access-tokens.md) — the credential that
  // lets a coding agent in a cloud VM authenticate as a real account without a browser,
  // a Google identity, or any bypass route. Same operator allowlist as the views above,
  // and session-only, so a token can never mint another.
  await registerAccessTokenRoutes(app, { store, adminUids });

  // Creator control panel (docs/improvement-loop-plan.md IL-2 creator surface). Own
  // shelf + per-game health for games this uid owns — not the operator catalog view.
  // Secret resolution must stay byte-for-byte with registerSubmissionRoutes, or studio
  // deep-link tokens will fail verification on the status/improve routes.
  const nodeEnv = process.env.NODE_ENV;
  const githubToken = options.submissionRoutes?.githubToken ?? process.env.GITHUB_TOKEN;
  const localGames =
    nodeEnv !== 'production' &&
    nodeEnv !== 'test' &&
    !githubToken &&
    !options.submissionRoutes?.githubClient
      ? await resolveLocalGamesDir()
      : null;
  const submissionTokenSecret =
    options.submissionRoutes?.submissionTokenSecret ??
    process.env.SUBMISSION_TOKEN_SECRET ??
    (localGames ? 'local-development-submission-secret' : undefined);
  await registerCreatorStudioRoutes(app, {
    store,
    mintStatusToken: submissionTokenSecret
      ? (issueNumber) => mintToken(issueNumber, submissionTokenSecret)
      : undefined,
  });

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
    // Contact form: same reason as legal pages being reachable without a session.
    // The handler itself is IP-rate-limited and moderated; the wall must not 401 it.
    if (request.url.startsWith('/api/contact')) return;
    // Internal endpoints (the Cloud Scheduler notification sweep) authenticate via
    // an OIDC token in the handler, not a session — the wall would 401 them first.
    if (request.url.startsWith('/api/internal/')) return;
    // The build channel: the coding agent runs inside GitHub's sandbox and has no
    // session and never will. It authenticates with a per-build token verified in
    // the handler, scoped to talking about the one build it was handed.
    if (request.url.startsWith('/api/agent/')) return;
    // The controller websocket is the one door anonymous guests may reach: a phone
    // that scanned a QR has no session and never will. It is useless without a
    // room token (verified in the first frame, not here), and the room it opens
    // was created by an allowlisted host. Everything else stays walled.
    if (request.url.startsWith('/api/mp/ws')) return;
    // Visit telemetry measures the arrival itself, which for most visitors during
    // closed beta happens *before* sign-in — walling it would silently zero out the
    // one funnel this stream exists to capture. It never reads request.user and
    // records no identifying data, so admitting it from the open internet is free.
    // Play telemetry stays behind the wall (see registerTelemetryRoutes above).
    if (request.url.startsWith('/api/telemetry/visit')) return;
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
    // SPA shell: known deep links (`/play/<slug>`, …) keep HTTP 200 so refresh
    // works; everything else gets a *proper* HTTP 404 with the same `index.html`
    // so crawlers/tools see a real miss while the client can still render NotFound.
    // Missing extension-bearing files stay hard 404s (never the HTML shell).
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api')) {
        return reply.status(404).send({ error: 'not found' });
      }
      if (looksLikeStaticAsset(request.url)) {
        return reply.status(404).send({ error: 'not found' });
      }
      const status = isKnownSpaShellPath(request.url) ? 200 : 404;
      return reply.status(status).type('text/html').sendFile('index.html');
    });
  }

  return app;
}
