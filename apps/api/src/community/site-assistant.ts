import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { GenAIClient } from 'genaicode';
import { createAgentBackend, type AgentBackend, type BackendUser } from 'genaicode/backend';
import { checkUserAccess } from '../platform/auth.js';
import { createAnthropicClient, resolveAnthropicApiKey } from '../platform/genai-anthropic.js';
import { sessionWriteAllowed } from '../platform/session-csrf.js';
import type { Store } from '../platform/store.js';
import {
  createSiteAssistantLimiter,
  resolveDailyAssistantPromptQuota,
  type SiteAssistantLimiter,
} from './site-assistant-limiter.js';

// The site mascot as an assistant: a small model behind genaicode/backend.

export const DEFAULT_SITE_ASSISTANT_MODEL = 'claude-haiku-5-5';
export const SITE_ASSISTANT_BASE_PATH = '/api/assistant';

// Off unless the deploy says otherwise; the page then keeps to Nano.
export const siteAssistantEnabled = (env: NodeJS.ProcessEnv = process.env) => env.SITE_ASSISTANT === 'true';

// Every tool runs in the page, with the visitor's rights.
export const SITE_ASSISTANT_PAGE_TOOLS = [
  {
    name: 'search_games',
    description: 'Search the gamedev.pl catalog. Returns matching games with slug, title and a short description.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What the visitor is looking for.' } },
      required: ['query'],
    },
  },
  {
    name: 'open_game',
    description: 'Open the page of one game, by the slug search_games returned.',
    inputSchema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
  },
  {
    name: 'open_page',
    description: 'Open a page of the site: home (the catalog), create (make a game), agents (connect a coding agent).',
    inputSchema: {
      type: 'object',
      properties: { page: { type: 'string', enum: ['home', 'create', 'agents'] } },
      required: ['page'],
    },
  },
] as const;

const INSTRUCTIONS = [
  'You are the mascot of gamedev.pl, a site where people play browser games and make their own with AI.',
  'Help the visitor find a game to play and explain how the site works. Use search_games before you name a game.',
  'Answer in the language the visitor writes in, in two or three short sentences.',
  'You cannot build, edit, publish or delete anything, and you know nothing about accounts or payments.',
  'For anything else, say briefly that you only help with gamedev.pl.',
].join(' ');

// Tight on purpose: the lane's token cap is shared by everyone.
const LIMITS = {
  maxOutputTokens: 512,
  maxSteps: 4,
  conversationTokens: 20_000,
  maxToolOutput: 2_000,
  maxPromptChars: 2_000,
  maxBodyBytes: 96 * 1024,
  maxStateBytes: 48 * 1024,
  stateTtlMs: 2 * 60 * 60 * 1000,
};
const BODY_LIMIT = LIMITS.maxBodyBytes;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SiteAssistantRoutesOptions {
  store: Store;
  // Signs sessions already; the state token key is derived from it.
  sessionSecret: string;
  // Tests pass a fake model here.
  client?: GenAIClient;
  limiter?: SiteAssistantLimiter;
  dailyPromptQuota?: number;
  now?: () => number;
}

export function registerSiteAssistantRoutes(app: FastifyInstance, options: SiteAssistantRoutesOptions): void {
  const { store } = options;
  const now = options.now ?? Date.now;
  const limiter =
    options.limiter ??
    createSiteAssistantLimiter({ store, now, logWarn: (payload, msg) => app.log.warn(payload, msg) });
  const users = new WeakMap<Request, BackendUser>();
  let backend: AgentBackend | null | undefined;

  // Built on first use; null when no model key is configured.
  function getBackend(): AgentBackend | null {
    if (backend !== undefined) return backend;
    const model = process.env.SITE_ASSISTANT_MODEL?.trim() || DEFAULT_SITE_ASSISTANT_MODEL;
    const client = options.client ?? (resolveAnthropicApiKey() ? createAnthropicClient({ model }) : undefined);
    if (!client) return (backend = null);
    backend = createAgentBackend({
      client,
      name: 'gamedev.pl',
      instructions: INSTRUCTIONS,
      // Separate key per purpose; a leaked token never signs a session.
      secret: createHmac('sha256', options.sessionSecret).update('site-assistant-state-v1').digest('hex'),
      authorize: (request) => users.get(request) ?? null,
      basePath: SITE_ASSISTANT_BASE_PATH,
      pageTools: SITE_ASSISTANT_PAGE_TOOLS,
      limits: LIMITS,
      limiter,
      // Counts only, never the conversation's text.
      onTurn: (report) => app.log.info({ event: 'site_assistant_turn', ...report }, 'site assistant turn'),
      onError: (error) => app.log.warn({ err: error }, 'site assistant model call failed'),
    });
    return backend;
  }

  const today = () => new Date(now()).toISOString().slice(0, 10);
  const tomorrow = () => (Math.floor(now() / DAY_MS) + 1) * DAY_MS;
  const promptQuota = () => resolveDailyAssistantPromptQuota(options.dailyPromptQuota);

  // Admits the request, or answers it and returns undefined.
  function admit(request: FastifyRequest, reply: FastifyReply): AgentBackend | undefined {
    reply.header('cache-control', 'no-store');
    const ready = siteAssistantEnabled() ? getBackend() : null;
    if (!ready) {
      reply.status(404).send({ error: 'not found' });
      return undefined;
    }
    if (!checkUserAccess(request, reply)) return undefined;
    if (!sessionWriteAllowed(request)) {
      reply.status(403).send({ error: 'cross-site request refused' });
      return undefined;
    }
    return ready;
  }

  async function forward(ready: AgentBackend, request: FastifyRequest, reply: FastifyReply, route: string) {
    // A visitor who leaves stops paying for the answer.
    const gone = new AbortController();
    request.raw.once('close', () => {
      if (!reply.raw.writableEnded) gone.abort();
    });
    const site = request.headers['sec-fetch-site'];
    const forwarded = new Request(`http://site-assistant.internal${SITE_ASSISTANT_BASE_PATH}${route}`, {
      method: request.method,
      headers: {
        ...(request.method === 'POST' ? { 'content-type': 'application/json' } : {}),
        ...(typeof site === 'string' ? { 'sec-fetch-site': site } : {}),
      },
      ...(request.method === 'POST' ? { body: JSON.stringify(request.body ?? {}) } : {}),
      signal: gone.signal,
    });
    users.set(forwarded, { id: request.user!.uid });
    return await ready.handle(forwarded);
  }

  app.get(`${SITE_ASSISTANT_BASE_PATH}/info`, async (request, reply) => {
    const ready = admit(request, reply);
    if (!ready) return reply;
    const response = await forward(ready, request, reply, '/info');
    const info = (await response.json()) as Record<string, unknown>;
    if (response.ok && info.available === true && request.user!.tier !== 'trusted') {
      const usage = await store.getUsage(request.user!.uid, today());
      if ((usage.assistantPrompts ?? 0) >= promptQuota()) {
        return reply.send({ ...info, available: false, resetsAt: tomorrow() });
      }
    }
    return reply.status(response.status).send(info);
  });

  app.post(
    `${SITE_ASSISTANT_BASE_PATH}/turn`,
    { bodyLimit: BODY_LIMIT, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const ready = admit(request, reply);
      if (!ready) return reply;
      const body = request.body as { prompt?: unknown } | null;
      // A prompt opens a turn; tool results that continue one are free.
      if (
        body &&
        typeof body === 'object' &&
        body.prompt !== undefined &&
        (await limiter.check(request.user!.uid)).ok
      ) {
        const quota = await store.checkAndIncrementQuota(request.user!.uid, today(), promptQuota(), 'assistantPrompts');
        if (!quota.allowed) {
          return reply.status(429).send({
            error: 'daily assistant prompts used up',
            failure: { kind: 'quota', resetsAt: tomorrow() },
          });
        }
      }
      const response = await forward(ready, request, reply, '/turn');
      reply.status(response.status);
      response.headers.forEach((value, name) => reply.header(name, value));
      reply.header('cache-control', 'no-store');
      if (!response.body) return reply.send();
      return reply.send(Readable.fromWeb(response.body as WebReadableStream));
    },
  );
}
