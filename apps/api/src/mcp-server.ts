import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  classifyAgentTokenAccess,
  InvalidAgentTokenError,
  mintAgentToken,
  readBearerToken,
  STALE_AGENT_TOKEN_REASON,
  verifyAgentToken,
  type AgentTokenAccess,
  type AgentTokenClaims,
} from './agent-token.js';
import { selfBuildDeliveryCap } from './builder.js';
import type { GamesStore } from './games-store.js';
import type { GcsObjectStore } from './gcs-sign.js';
import {
  assertMcpSessionKeyUnexpired,
  mintMcpSessionKey,
  newMcpSessionId,
  verifyMcpSessionKey,
} from './mcp-session-key.js';
import { MCP_ENDPOINT_PATH } from './self-build-connect.js';
import { BUILD_STEPS } from './submission-status.js';
import type { Store, SubmissionRecord } from './store.js';

/**
 * Streamable-HTTP MCP endpoint (BY-05).
 *
 * Job binding is prompt-first: install configures the URL alone; `start({ key })`
 * validates the round key and returns a short-lived `sessionKey`. Every later tool
 * authenticates on that argument (or on `Authorization: Bearer <round key>`). The
 * transport `Mcp-Session-Id` correlator authorizes nothing — MCP spec forbids it.
 *
 * Tools wrap the existing `/api/agent/build/*` channel. Mutating replies always
 * include `{ stop, pendingMessages }`.
 */

const PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-11-25', '2025-03-26', '2024-11-05']);

/** Self-explaining stale/finished copy (matches channel; Studio is the fix). */
const FINISHED_REASON = STALE_AGENT_TOKEN_REASON;

const SESSION_HEADER = 'mcp-session-id';

/** Aggressive ceiling on unauthenticated / invalid `start` attempts per IP. */
const MAX_INVALID_STARTS_PER_WINDOW = 20;
const INVALID_START_WINDOW_MS = 60 * 60 * 1000;

/** Hard body ceiling for MCP POSTs (screenshots up to 2 MB base64-expanded). */
const MAX_MCP_BODY_BYTES = 3 * 1024 * 1024;

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const MAX_SUBMIT_FILES = 200;

export interface McpServerOptions {
  store?: Store;
  agentTokenSecret?: string;
  now?: () => number;
  gamesStore?: GamesStore;
  objectStore?: GcsObjectStore;
  /**
   * Origins allowed when the client sends an `Origin` header (DNS-rebinding
   * mitigation). Absent Origin is allowed — coding agents are not browsers.
   */
  allowedOrigins?: string[];
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;

interface ToolContext {
  request: FastifyRequest;
  sessionId: string | null;
  bearerToken: string | null;
}

interface AuthedJob {
  issueNumber: number;
  record: SubmissionRecord;
  access: AgentTokenAccess;
  /** Round-scoped agent token for channel inject (same generation as the capability). */
  channelToken: string;
  claims: Pick<AgentTokenClaims, 'jobId' | 'roundGeneration' | 'exp'>;
}

function jsonRpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, result };
}

function jsonRpcError(id: string | number | null | undefined, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: '2.0' as const,
    id: id ?? null,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

function toolOk(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function toolErr(message: string, data?: unknown): ToolResult {
  const payload = { error: message, ...(data && typeof data === 'object' ? data : {}) };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true,
  };
}

function pruneHits(buckets: Map<string, number[]>, key: string, currentTime: number): number[] {
  const hits = (buckets.get(key) ?? []).filter((timestamp) => currentTime - timestamp < INVALID_START_WINDOW_MS);
  buckets.set(key, hits);
  return hits;
}

function isOverInvalidStartLimit(buckets: Map<string, number[]>, key: string, currentTime: number): boolean {
  return pruneHits(buckets, key, currentTime).length >= MAX_INVALID_STARTS_PER_WINDOW;
}

function noteInvalidStartHit(buckets: Map<string, number[]>, key: string, currentTime: number): void {
  const hits = pruneHits(buckets, key, currentTime);
  hits.push(currentTime);
  buckets.set(key, hits);
}

function headerValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0].trim();
  return null;
}

function pendingMessagesFromChannel(body: {
  pending?: Array<{ id: string; text: string; createdAt: string }>;
  pendingMessages?: Array<{ id: string; text: string; createdAt: string }>;
}): Array<{ id: string; text: string; createdAt: string }> {
  return body.pendingMessages ?? body.pending ?? [];
}

function stopFromChannel(body: { control?: { stop?: boolean; reason?: string } }): {
  stop: boolean;
  reason?: string;
} {
  const stop = Boolean(body.control?.stop);
  return stop ? { stop: true, ...(body.control?.reason ? { reason: body.control.reason } : {}) } : { stop: false };
}

const BEHAVIOURAL_CONTRACT = [
  'Report progress before and after long steps.',
  'Send a screenshot as soon as the game draws anything playable.',
  'Run kit checks green (at least check:static) before submit_sources.',
  'Honour stop immediately — do not continue after stop:true.',
  'When get_brief.seedAvailable is true, continue the seed (get_seed) rather than scaffolding from scratch.',
].join(' ');

const SESSION_KEY_PROP = {
  type: 'string' as const,
  description:
    'Short-lived session capability from start(). Required on every tool call unless Authorization: Bearer <round key> is configured. Mcp-Session-Id alone is never authority.',
};

export async function registerMcpServerRoutes(app: FastifyInstance, options: McpServerOptions = {}): Promise<void> {
  const store = options.store;
  const agentTokenSecret = options.agentTokenSecret ?? process.env.SUBMISSION_TOKEN_SECRET;
  const now = options.now ?? Date.now;
  const allowedOrigins = options.allowedOrigins ?? parseAllowedOrigins();

  /** Transport sessions only — never consulted for authorization. */
  const transportSessions = new Map<string, { createdAt: number }>();
  const invalidStartsByIp = new Map<string, number[]>();

  function originAllowed(request: FastifyRequest): boolean {
    const origin = headerValue(request.headers.origin);
    if (!origin) return true;
    if (allowedOrigins.length === 0) return true;
    return allowedOrigins.includes(origin);
  }

  async function injectChannel(
    method: 'GET' | 'POST',
    path: string,
    channelToken: string,
    body?: Record<string, unknown> | unknown[],
  ): Promise<{ statusCode: number; json: () => unknown }> {
    const response = await app.inject({
      method,
      url: path,
      headers: {
        authorization: `Bearer ${channelToken}`,
        'content-type': 'application/json',
      },
      ...(body !== undefined ? { payload: body } : {}),
    });
    return response;
  }

  async function resolveAuth(
    ctx: ToolContext,
    args: Record<string, unknown>,
    options: { allowTerminalReceipt?: boolean } = {},
  ): Promise<AuthedJob | ToolResult> {
    if (!store || !agentTokenSecret) {
      return toolErr('the MCP build endpoint is not configured');
    }

    const sessionKeyArg = typeof args.sessionKey === 'string' ? args.sessionKey.trim() : '';
    const bearer = ctx.bearerToken;

    let claims: AgentTokenClaims;
    let channelToken: string;

    if (bearer) {
      try {
        claims = verifyAgentToken(bearer, agentTokenSecret);
      } catch (error) {
        if (error instanceof InvalidAgentTokenError) {
          return toolErr(error.message || 'invalid build key');
        }
        throw error;
      }
      channelToken = bearer;
    } else if (sessionKeyArg) {
      let sessionClaims;
      try {
        sessionClaims = verifyMcpSessionKey(sessionKeyArg, agentTokenSecret);
        assertMcpSessionKeyUnexpired(sessionClaims, now());
      } catch (error) {
        if (error instanceof InvalidAgentTokenError) {
          return toolErr(error.message || FINISHED_REASON);
        }
        throw error;
      }
      claims = {
        jobId: sessionClaims.jobId,
        roundGeneration: sessionClaims.roundGeneration,
        exp: sessionClaims.exp,
      };
      // Ephemeral channel token for inject — same generation, short TTL. Not returned.
      channelToken = mintAgentToken(sessionClaims.jobId, agentTokenSecret, {
        roundGeneration: sessionClaims.roundGeneration,
        now: now(),
        ttlDays: 1,
      });
    } else {
      // Possession of Mcp-Session-Id alone authorizes nothing.
      return toolErr(
        'missing credential: pass sessionKey from start(), or configure Authorization: Bearer <round key>',
      );
    }

    const record = await store.getSubmission(claims.jobId);
    if (!record) {
      return toolErr('unknown build');
    }

    let access: AgentTokenAccess;
    try {
      access = classifyAgentTokenAccess(claims, record, now());
    } catch (error) {
      if (error instanceof InvalidAgentTokenError) {
        return toolErr(error.message || FINISHED_REASON);
      }
      throw error;
    }

    if (access === 'terminal_receipt' && !options.allowTerminalReceipt) {
      return toolErr(FINISHED_REASON);
    }

    return {
      issueNumber: claims.jobId,
      record,
      access,
      channelToken,
      claims: {
        jobId: claims.jobId,
        roundGeneration: claims.roundGeneration,
        exp: claims.exp,
      },
    };
  }

  async function writePiggyback(
    channelToken: string,
  ): Promise<{ stop: boolean; reason?: string; pendingMessages: unknown[] }> {
    const inbox = await injectChannel('GET', '/api/agent/build/inbox', channelToken);
    if (inbox.statusCode !== 200) {
      return { stop: false, pendingMessages: [] };
    }
    const body = inbox.json() as {
      pending?: Array<{ id: string; text: string; createdAt: string }>;
      control?: { stop?: boolean; reason?: string };
    };
    return {
      ...stopFromChannel(body),
      pendingMessages: pendingMessagesFromChannel(body),
    };
  }

  const tools: Record<
    string,
    {
      description: string;
      inputSchema: Record<string, unknown>;
      handler: ToolHandler;
    }
  > = {
    start: {
      description:
        "Bind this MCP client to a build round using the key from the creator's Studio kickoff prompt. " +
        'Returns a short-lived sessionKey — pass it as sessionKey on every later tool call. ' +
        'Does not treat Mcp-Session-Id as authority. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Round key from the Studio kickoff prompt (the line "key: …").',
          },
        },
        required: ['key'],
      },
      handler: async (args, ctx) => {
        if (!store || !agentTokenSecret) {
          return toolErr('the MCP build endpoint is not configured');
        }

        if (isOverInvalidStartLimit(invalidStartsByIp, ctx.request.ip, now())) {
          return toolErr(
            'too many invalid start attempts — ask the creator for the current prompt in their Studio thread',
          );
        }

        const key = typeof args.key === 'string' ? args.key.trim() : '';
        if (!key) {
          noteInvalidStart(ctx.request);
          return toolErr("key is required — paste the key from the creator's Studio kickoff prompt");
        }

        let claims: AgentTokenClaims;
        try {
          claims = verifyAgentToken(key, agentTokenSecret);
        } catch {
          noteInvalidStart(ctx.request);
          return toolErr('invalid key — ask the creator for the current prompt in their Studio thread');
        }

        const record = await store.getSubmission(claims.jobId);
        if (!record) {
          noteInvalidStart(ctx.request);
          return toolErr('unknown build — ask the creator for the current prompt in their Studio thread');
        }

        let access: AgentTokenAccess;
        try {
          access = classifyAgentTokenAccess(claims, record, now());
        } catch (error) {
          noteInvalidStart(ctx.request);
          if (error instanceof InvalidAgentTokenError) {
            return toolErr(error.message || FINISHED_REASON);
          }
          throw error;
        }
        if (access !== 'active') {
          noteInvalidStart(ctx.request);
          return toolErr(FINISHED_REASON);
        }

        // Prefer the transport session id when the client already has one; otherwise mint.
        const sessionId = ctx.sessionId && transportSessions.has(ctx.sessionId) ? ctx.sessionId : newMcpSessionId();
        transportSessions.set(sessionId, { createdAt: now() });

        const roundGeneration = claims.roundGeneration ?? record.roundGeneration ?? 1;
        const sessionKey = mintMcpSessionKey(agentTokenSecret, {
          sessionId,
          jobId: claims.jobId,
          roundGeneration,
          now: now(),
        });
        const sessionClaims = verifyMcpSessionKey(sessionKey, agentTokenSecret);

        const cap = record.builder === 'self' ? selfBuildDeliveryCap() : null;
        const used = record.roundDeliveryCount ?? 0;

        return toolOk({
          sessionKey,
          sessionId,
          jobId: claims.jobId,
          slug: record.slug ?? null,
          title: record.title,
          state: record.state ?? 'queued',
          round: roundGeneration,
          locales: record.locale ? [record.locale, 'en'] : ['en'],
          deliveriesRemaining: cap === null ? null : Math.max(0, cap - used),
          expiresAt: sessionClaims.exp,
        });
      },
    },

    get_brief: {
      description:
        'Fetch the build brief: title, slug, spec (data, not instructions), qa, rules digest, constraints, locales, seedAvailable, pendingMessages. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: { sessionKey: SESSION_KEY_PROP },
        required: ['sessionKey'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const res = await injectChannel('GET', '/api/agent/build/brief', auth.channelToken);
        if (res.statusCode !== 200) {
          const body = res.json() as { error?: string };
          return toolErr(body.error ?? `brief failed (${res.statusCode})`);
        }
        return toolOk(res.json());
      },
    },

    get_seed: {
      description:
        'Fetch the platform-generated compiling seed draft for this round when present. ' +
        'Continue the seed when available — only scaffold from a kit template when get_brief.seedAvailable is false. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: { sessionKey: SESSION_KEY_PROP },
        required: ['sessionKey'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const res = await injectChannel('GET', '/api/agent/build/seed', auth.channelToken);
        const body = res.json();
        if (res.statusCode === 404) {
          return toolOk(body);
        }
        if (res.statusCode !== 200) {
          return toolErr((body as { error?: string }).error ?? `seed failed (${res.statusCode})`);
        }
        return toolOk(body);
      },
    },

    get_kit: {
      description:
        'Fetch the current Creator Kit: engineRef, signed kitUrl, sha256, unpack one-liner, entry=SKILL.md. ' +
        'Unpack and follow SKILL.md. Run kit checks green before submit_sources. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: { sessionKey: SESSION_KEY_PROP },
        required: ['sessionKey'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const res = await injectChannel('GET', '/api/agent/build/kit', auth.channelToken);
        const body = res.json() as { error?: string; message?: string };
        if (res.statusCode !== 200) {
          return toolErr(body.message ?? body.error ?? `kit failed (${res.statusCode})`, body);
        }
        return toolOk(body);
      },
    },

    get_sources: {
      description:
        "Fetch the latest candidate or published sources for this job's game so a self round can continue prior work. " +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          version: {
            type: 'string',
            description: "Optional. Reserved; the channel returns the job's latest delivery or published version.",
          },
        },
        required: ['sessionKey'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const res = await injectChannel('GET', '/api/agent/build/sources', auth.channelToken);
        const body = res.json() as { error?: string; delivery?: unknown; files?: unknown[] };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `sources failed (${res.statusCode})`);
        }
        return toolOk({
          available: Boolean(body.delivery),
          delivery: body.delivery ?? null,
          files: body.files ?? [],
        });
      },
    },

    list_examples: {
      description:
        'List curated first-party exemplar games (never creator-originating sources). Filter by genre/feature/module when provided. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          genre: { type: 'string' },
          feature: { type: 'string' },
          module: { type: 'string' },
        },
        required: ['sessionKey'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const res = await injectChannel('GET', '/api/agent/build/examples', auth.channelToken);
        const body = res.json() as {
          error?: string;
          examples?: Array<{ slug: string; title: string; genre: string; modules: string[]; whyReference: string }>;
        };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `examples failed (${res.statusCode})`);
        }
        let examples = body.examples ?? [];
        const genre = typeof args.genre === 'string' ? args.genre.trim().toLowerCase() : '';
        const feature = typeof args.feature === 'string' ? args.feature.trim().toLowerCase() : '';
        const moduleFilter = typeof args.module === 'string' ? args.module.trim().toLowerCase() : '';
        if (genre) {
          examples = examples.filter((ex) => ex.genre.toLowerCase().includes(genre));
        }
        if (moduleFilter) {
          examples = examples.filter((ex) => ex.modules.some((m) => m.toLowerCase().includes(moduleFilter)));
        }
        if (feature) {
          examples = examples.filter(
            (ex) =>
              ex.whyReference.toLowerCase().includes(feature) ||
              ex.modules.some((m) => m.toLowerCase().includes(feature)) ||
              ex.title.toLowerCase().includes(feature),
          );
        }
        return toolOk({ examples });
      },
    },

    get_example: {
      description:
        'Fetch one allowlisted exemplar as a signed tarball URL. Unknown or non-allowlisted slugs fail. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          slug: { type: 'string', description: 'Allowlisted exemplar slug from list_examples.' },
        },
        required: ['sessionKey', 'slug'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
        if (!slug) return toolErr('slug is required');
        const res = await injectChannel(
          'GET',
          `/api/agent/build/examples/${encodeURIComponent(slug)}`,
          auth.channelToken,
        );
        const body = res.json() as { error?: string; message?: string };
        if (res.statusCode !== 200) {
          return toolErr(body.message ?? body.error ?? `example failed (${res.statusCode})`, body);
        }
        return toolOk(body);
      },
    },

    report_progress: {
      description:
        'Report a build-progress update to the creator thread. Call before and after long steps. ' +
        `step is one of: ${BUILD_STEPS.join(', ')}. Reply includes stop and pendingMessages. ` +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          step: { type: 'string', enum: [...BUILD_STEPS] },
          text: { type: 'string', description: 'English progress sentence, ≤300 chars.' },
          textLocalized: { type: 'string' },
          locale: { type: 'string' },
          done: { type: 'integer' },
          total: { type: 'integer' },
        },
        required: ['sessionKey', 'text'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const payload: Record<string, unknown> = {
          text: args.text,
          ...(typeof args.step === 'string' ? { step: args.step } : {}),
          ...(typeof args.textLocalized === 'string' ? { textLocalized: args.textLocalized } : {}),
          ...(typeof args.locale === 'string' ? { locale: args.locale } : {}),
        };
        if (typeof args.done === 'number' && typeof args.total === 'number') {
          payload.progress = { done: args.done, total: args.total };
        }
        const res = await injectChannel('POST', '/api/agent/build/progress', auth.channelToken, payload);
        const body = res.json() as {
          error?: string;
          accepted?: boolean;
          rejected?: string;
          control?: { stop?: boolean; reason?: string };
          pending?: Array<{ id: string; text: string; createdAt: string }>;
        };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `progress failed (${res.statusCode})`);
        }
        return toolOk({
          ok: body.accepted !== false,
          ...(body.rejected ? { rejected: body.rejected } : {}),
          ...stopFromChannel(body),
          pendingMessages: pendingMessagesFromChannel(body),
        });
      },
    },

    send_screenshot: {
      description:
        'Upload a PNG screenshot (base64, ≤2 MB decoded) as soon as the game draws. Reply includes stop and pendingMessages. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          png: { type: 'string', description: 'Base64-encoded PNG (≤2 MB decoded).' },
          pngBase64: { type: 'string', description: 'Alias for png.' },
          caption: { type: 'string' },
          label: { type: 'string' },
        },
        required: ['sessionKey'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const pngRaw =
          typeof args.png === 'string' ? args.png : typeof args.pngBase64 === 'string' ? args.pngBase64 : '';
        const png = pngRaw.replace(/^data:image\/png;base64,/i, '').replace(/\s+/g, '');
        if (!png) return toolErr('png is required');
        let bytes: Buffer;
        try {
          bytes = Buffer.from(png, 'base64');
        } catch {
          return toolErr('png must be base64');
        }
        if (bytes.length > MAX_SCREENSHOT_BYTES) {
          return toolErr('screenshot is too large (max 2 MB)');
        }
        const label =
          typeof args.caption === 'string' ? args.caption : typeof args.label === 'string' ? args.label : undefined;
        const res = await injectChannel('POST', '/api/agent/build/shot', auth.channelToken, {
          png,
          ...(label ? { label } : {}),
        });
        const body = res.json() as {
          error?: string;
          accepted?: boolean;
          rejected?: string;
          control?: { stop?: boolean; reason?: string };
          pending?: Array<{ id: string; text: string; createdAt: string }>;
        };
        if (res.statusCode === 413) {
          return toolErr(body.error ?? 'screenshot is too large');
        }
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `screenshot failed (${res.statusCode})`);
        }
        return toolOk({
          ok: body.accepted !== false,
          ...(body.rejected ? { rejected: body.rejected } : {}),
          ...stopFromChannel(body),
          pendingMessages: pendingMessagesFromChannel(body),
        });
      },
    },

    submit_sources: {
      description:
        'Deliver game sources for the gate. files[{path, content, encoding utf8|base64}] ≤200 items; kitEngineRef required (from get_kit / kit.json). ' +
        'Subject to delivery cap and filename allowlist. Run kit checks green before submitting. Reply includes stop and pendingMessages. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          files: {
            type: 'array',
            maxItems: MAX_SUBMIT_FILES,
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
                encoding: { type: 'string', enum: ['utf8', 'base64'] },
              },
              required: ['path', 'content'],
            },
          },
          kitEngineRef: {
            type: 'string',
            description: 'Creator Kit engineRef the sources were built against (from get_kit / kit.json).',
          },
          slug: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['sessionKey', 'files', 'kitEngineRef'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;

        const filesParse = z
          .array(
            z.object({
              path: z.string().trim().min(1).max(120),
              content: z.string(),
              encoding: z.enum(['utf8', 'base64']).optional(),
            }),
          )
          .min(1)
          .max(MAX_SUBMIT_FILES)
          .safeParse(args.files);
        if (!filesParse.success) {
          return toolErr(filesParse.error.issues[0]?.message ?? 'invalid files');
        }
        if (filesParse.data.length > MAX_SUBMIT_FILES) {
          return toolErr(`too many files (max ${MAX_SUBMIT_FILES})`);
        }

        const kitEngineRef = typeof args.kitEngineRef === 'string' ? args.kitEngineRef.trim() : '';
        if (!kitEngineRef) {
          return toolErr('kitEngineRef is required — send the engineRef from get_kit / kit.json');
        }

        const decodedFiles: Array<{ path: string; content: string }> = [];
        for (const file of filesParse.data) {
          if (file.encoding === 'base64') {
            try {
              decodedFiles.push({ path: file.path, content: Buffer.from(file.content, 'base64').toString('utf8') });
            } catch {
              return toolErr(`file ${file.path}: invalid base64 content`);
            }
          } else {
            decodedFiles.push({ path: file.path, content: file.content });
          }
        }

        const slug =
          typeof args.slug === 'string' && args.slug.trim() ? args.slug.trim() : (auth.record.slug ?? 'game');

        const res = await injectChannel('POST', '/api/agent/build/sources', auth.channelToken, {
          slug,
          files: decodedFiles,
          kitEngineRef,
        });
        const body = res.json() as {
          error?: string;
          reason?: string;
          accepted?: boolean;
          rejected?: string;
          delivery?: { slug: string; version: string };
          deliveryCap?: number;
          deliveriesUsed?: number;
          control?: { stop?: boolean; reason?: string };
          pending?: Array<{ id: string; text: string; createdAt: string }>;
        };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `submit failed (${res.statusCode})`, body);
        }

        const cap = auth.record.builder === 'self' ? selfBuildDeliveryCap() : null;
        const used =
          (await store!.getSubmission(auth.issueNumber))?.roundDeliveryCount ?? auth.record.roundDeliveryCount ?? 0;

        return toolOk({
          ok: body.accepted !== false,
          ...(body.rejected ? { rejected: body.rejected } : {}),
          deliveryId: body.delivery?.version ?? null,
          delivery: body.delivery ?? null,
          gateStarted: body.accepted === true,
          deliveriesRemaining: cap === null ? null : Math.max(0, cap - used),
          ...stopFromChannel(body),
          pendingMessages: pendingMessagesFromChannel(body),
        });
      },
    },

    get_gate_verdict: {
      description:
        'Poll the gate verdict for a delivery (default: latest). Terminal receipt: still readable after the round closes ' +
        "when your capability's generation owns that delivery (generation may be exactly one behind current). " +
        'Expiry still applies. Wait for green before considering the round done. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          deliveryId: { type: 'string', description: "Delivery version id; default is the job's latest." },
        },
        required: ['sessionKey'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args, { allowTerminalReceipt: true });
        if (!('channelToken' in auth)) return auth;

        const deliveryId =
          typeof args.deliveryId === 'string' && args.deliveryId.trim() ? args.deliveryId.trim() : null;
        const path = deliveryId
          ? `/api/agent/build/gate?version=${encodeURIComponent(deliveryId)}`
          : '/api/agent/build/gate';
        const res = await injectChannel('GET', path, auth.channelToken);
        const body = res.json() as Record<string, unknown> & { error?: string };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `gate verdict failed (${res.statusCode})`);
        }
        return toolOk(body);
      },
    },

    read_inbox: {
      description:
        'Read pending creator messages and control (stop). Prefer this when idle; mutating tools also piggyback pendingMessages. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: { sessionKey: SESSION_KEY_PROP },
        required: ['sessionKey'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const res = await injectChannel('GET', '/api/agent/build/inbox', auth.channelToken);
        const body = res.json() as {
          error?: string;
          pending?: Array<{ id: string; text: string; createdAt: string }>;
          control?: { stop?: boolean; reason?: string };
          gate?: unknown;
        };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `inbox failed (${res.statusCode})`);
        }
        return toolOk({
          messages: pendingMessagesFromChannel(body),
          pendingMessages: pendingMessagesFromChannel(body),
          ...stopFromChannel(body),
          ...(body.gate ? { gate: body.gate } : {}),
        });
      },
    },

    ack_inbox: {
      description:
        'Acknowledge creator inbox message ids after you have applied them. This is a write — the reply includes stop and pendingMessages ' +
        'so a concurrent stop or newly queued message is visible without a separate poll. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          ids: { type: 'array', items: { type: 'string' }, maxItems: 50 },
        },
        required: ['sessionKey', 'ids'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const idsParse = z.array(z.string().trim().min(1).max(64)).max(50).safeParse(args.ids);
        if (!idsParse.success) {
          return toolErr(idsParse.error.issues[0]?.message ?? 'invalid ids');
        }
        const res = await injectChannel('POST', '/api/agent/build/inbox/ack', auth.channelToken, {
          ids: idsParse.data,
        });
        const body = res.json() as {
          error?: string;
          ok?: boolean;
          control?: { stop?: boolean; reason?: string };
          pending?: Array<{ id: string; text: string; createdAt: string }>;
        };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `ack failed (${res.statusCode})`);
        }
        // Ack is a write — always piggyback stop/pending (fresh read if channel omitted).
        const piggy = body.pending
          ? { ...stopFromChannel(body), pendingMessages: pendingMessagesFromChannel(body) }
          : await writePiggyback(auth.channelToken);
        return toolOk({
          ok: body.ok !== false,
          ...piggy,
        });
      },
    },
  };

  function noteInvalidStart(request: FastifyRequest): void {
    noteInvalidStartHit(invalidStartsByIp, request.ip, now());
  }

  async function handleJsonRpc(request: FastifyRequest, reply: FastifyReply, message: JsonRpcRequest) {
    const sessionHeader = headerValue(request.headers[SESSION_HEADER]);
    const bearerToken = readBearerToken(request.headers.authorization);

    // Notifications / responses: 202 with no body.
    const isNotification = message.id === undefined && typeof message.method === 'string';
    const isClientResponse =
      message.id !== undefined && message.method === undefined && ('result' in message || 'error' in message);

    if (isClientResponse) {
      return reply.status(202).send();
    }

    if (!message.method) {
      return reply.status(400).send(jsonRpcError(message.id, -32600, 'invalid request: method required'));
    }

    if (message.method === 'notifications/initialized' || message.method.startsWith('notifications/')) {
      return reply.status(202).send();
    }

    if (message.method === 'initialize') {
      const params = (message.params ?? {}) as { protocolVersion?: string; clientInfo?: unknown };
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : PROTOCOL_VERSION;

      const sessionId = newMcpSessionId();
      transportSessions.set(sessionId, { createdAt: now() });
      reply.header('Mcp-Session-Id', sessionId);
      reply.header('MCP-Session-Id', sessionId);

      return reply.send(
        jsonRpcResult(message.id, {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: 'gamedevpl',
            version: '1.0.0',
          },
          instructions:
            "Install is URL-only. Start with the gamedevpl start tool using the key from the creator's Studio kickoff prompt; " +
            'pass the returned sessionKey on every later tool call. Honour stop; screenshot early; kit-check before submit.',
        }),
      );
    }

    // Non-initialize requests: require session header when we issued one (transport only).
    if (sessionHeader && !transportSessions.has(sessionHeader)) {
      return reply.status(404).send({ error: 'unknown MCP session' });
    }

    const protocolVersion = headerValue(request.headers['mcp-protocol-version']);
    if (protocolVersion && !SUPPORTED_PROTOCOL_VERSIONS.has(protocolVersion)) {
      return reply.status(400).send({ error: 'unsupported MCP-Protocol-Version' });
    }

    const ctx: ToolContext = {
      request,
      sessionId: sessionHeader,
      bearerToken,
    };

    if (message.method === 'ping') {
      return reply.send(jsonRpcResult(message.id, {}));
    }

    if (message.method === 'tools/list') {
      return reply.send(
        jsonRpcResult(message.id, {
          tools: Object.entries(tools).map(([name, tool]) => ({
            name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        }),
      );
    }

    if (message.method === 'tools/call') {
      const params = (message.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      const name = typeof params.name === 'string' ? params.name : '';
      const tool = tools[name];
      if (!tool) {
        return reply.send(jsonRpcError(message.id, -32601, `unknown tool: ${name}`));
      }
      const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      try {
        const result = await tool.handler(args, ctx);
        // Echo session id on tool responses when we have one (transport correlator).
        if (sessionHeader) {
          reply.header('Mcp-Session-Id', sessionHeader);
        } else if (name === 'start' && result.structuredContent && typeof result.structuredContent === 'object') {
          const sid = (result.structuredContent as { sessionId?: string }).sessionId;
          if (sid) reply.header('Mcp-Session-Id', sid);
        }
        return reply.send(jsonRpcResult(message.id, result));
      } catch (error) {
        app.log.error({ err: error }, 'MCP tool handler failed');
        return reply.send(
          jsonRpcResult(message.id, toolErr(error instanceof Error ? error.message : 'internal error')),
        );
      }
    }

    if (isNotification) {
      return reply.status(202).send();
    }

    return reply.send(jsonRpcError(message.id, -32601, `method not found: ${message.method}`));
  }

  const mcpRouteConfig = {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    bodyLimit: MAX_MCP_BODY_BYTES,
  };

  app.post(MCP_ENDPOINT_PATH, mcpRouteConfig, async (request, reply) => {
    if (!originAllowed(request)) {
      return reply.status(403).send(jsonRpcError(null, -32000, 'forbidden origin'));
    }
    if (!store || !agentTokenSecret) {
      return reply.status(503).send({ error: 'the MCP build endpoint is not configured' });
    }

    const body = request.body;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send(jsonRpcError(null, -32600, 'invalid JSON-RPC body'));
    }

    // Single message only (streamable HTTP 2025-11-25 dropped batching).
    return handleJsonRpc(request, reply, body as JsonRpcRequest);
  });

  app.get(MCP_ENDPOINT_PATH, { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!originAllowed(request)) {
      return reply.status(403).send({ error: 'forbidden origin' });
    }
    // No server-initiated SSE in v1 — clients drive via POST tools/call.
    return reply.status(405).send({ error: 'SSE listen not offered; use POST for JSON-RPC' });
  });

  app.delete(
    MCP_ENDPOINT_PATH,
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!originAllowed(request)) {
        return reply.status(403).send({ error: 'forbidden origin' });
      }
      const sessionHeader = headerValue(request.headers[SESSION_HEADER]);
      if (!sessionHeader) {
        return reply.status(400).send({ error: 'Mcp-Session-Id required to terminate a session' });
      }
      transportSessions.delete(sessionHeader);
      return reply.status(204).send();
    },
  );
}

function parseAllowedOrigins(): string[] {
  const webOrigin = process.env.WEB_ORIGIN?.trim();
  const appBase = process.env.APP_BASE_URL?.trim();
  const origins = new Set<string>();
  if (webOrigin) {
    for (const entry of webOrigin.split(',')) {
      const trimmed = entry.trim();
      if (trimmed) origins.add(trimmed);
    }
  }
  if (appBase) origins.add(appBase.replace(/\/+$/, ''));
  return [...origins];
}
