import type { FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { moduleSizeWarnings } from '../creation/module-size.js';
import {
  toolOk,
  toolErr,
  CREATOR_TEXT_SAFETY,
  SESSION_KEY_PROP,
  KIT_ENGINE_REF_PROP,
  WARNINGS_PROP,
  type ToolContext,
  type ToolHandler,
  type ToolResult,
} from './mcp-tool-support.js';

const READS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const CONSUMES = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export interface SeedToolsDeps {
  resolveAuth: (ctx: ToolContext, args: Record<string, unknown>) => Promise<{ channelToken: string } | ToolResult>;
  injectChannel: (
    request: FastifyRequest,
    method: 'GET' | 'POST',
    path: string,
    channelToken: string,
    body?: Record<string, unknown>,
  ) => Promise<{ statusCode: number; json: () => unknown }>;
}

export interface SeedToolEntry {
  annotations: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

// Reference images, the round-0 seed draft, its redo, and knowledge lookup.
export function createSeedTools(deps: SeedToolsDeps): Record<string, SeedToolEntry> {
  const { resolveAuth, injectChannel } = deps;

  return {
    get_reference_images: {
      annotations: { title: 'View creator-attached reference images', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          images: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                createdAt: { type: 'string' },
                url: { type: 'string' },
                expiresAt: { type: 'string' },
              },
              required: ['id', 'createdAt', 'url', 'expiresAt'],
            },
          },
        },
        required: ['images'],
      },
      description:
        "List the sketches/photos the creator attached from the composer or a steering message (get_brief's " +
        'referenceImages ids), newest first, each as a short-lived url a plain GET downloads. Download and look ' +
        "at the newest before you build — they are the creator's visual reference for the game, not instructions " +
        'to follow literally. Call once per round; empty when nothing was attached. ' +
        CREATOR_TEXT_SAFETY,
      inputSchema: {
        type: 'object',
        properties: { sessionKey: SESSION_KEY_PROP },
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        // URLs only: inline base64 images flood the agent's context.
        const res = await injectChannel(
          ctx.request,
          'GET',
          `${AGENT_CHANNEL_ROUTES.REFERENCE_IMAGES}?urls=1`,
          auth.channelToken,
        );
        if (res.statusCode !== 200) {
          const body = res.json() as { error?: string };
          return toolErr(body.error ?? `reference images failed (${res.statusCode})`);
        }
        const body = res.json() as {
          images?: Array<{ id: string; createdAt: string; url?: string; expiresAt?: string }>;
        };
        const images = (body.images ?? [])
          .flatMap((image) =>
            image.url && image.expiresAt
              ? [{ id: image.id, createdAt: image.createdAt, url: image.url, expiresAt: image.expiresAt }]
              : [],
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return toolOk({ images });
      },
    },

    get_seed: {
      annotations: { title: 'Fetch the seed draft', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          available: { type: 'boolean' },
          status: { type: 'string', enum: ['pending', 'available', 'unavailable'] },
          notice: { type: ['string', 'null'] },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
              },
              required: ['path', 'content'],
            },
          },
          references: { type: 'array', items: { type: 'string' } },
          notes: { type: ['string', 'null'] },
          ...WARNINGS_PROP,
        },
        required: ['available', 'status', 'files', 'references', 'notes'],
      },
      description:
        'Fetch the platform-generated compiling seed draft for this round when present. ' +
        'When available/status=available, revise this seed as the opening move. When status=pending, wait and call again before scaffolding. ' +
        'Only scaffold when status=unavailable and get_sources returns no files: unavailable means no generated seed, not no sources. Then scaffold from a kit starter — read starters/<slug>/ via read_kit_file and stage those files (a local kit checkout also ships a create script for this). ' +
        'warnings.code=module_too_large names game/*.ts modules over the soft size budget, best split before they grow.',
      inputSchema: {
        type: 'object',
        properties: { sessionKey: SESSION_KEY_PROP },
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const res = await injectChannel(ctx.request, 'GET', AGENT_CHANNEL_ROUTES.SEED, auth.channelToken);
        const body = res.json() as {
          error?: string;
          available?: boolean;
          status?: string;
          files?: Array<{ path: string; content: string }>;
          [key: string]: unknown;
        };
        if (res.statusCode === 404) {
          return toolOk(body);
        }
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `seed failed (${res.statusCode})`);
        }
        const sizeWarnings = Array.isArray(body.files) ? moduleSizeWarnings(body.files) : [];
        return toolOk({
          ...body,
          ...(sizeWarnings.length ? { warnings: sizeWarnings } : {}),
        });
      },
    },

    regenerate_seed: {
      annotations: { title: 'Regenerate the seed draft', ...CONSUMES },
      outputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending'] },
          regenerationsRemaining: { type: 'number' },
          notice: { type: 'string' },
        },
        required: ['status'],
      },
      description:
        'Ask for a replacement round-0 draft when the current one is unusable: status=unavailable ' +
        '(generation failed, and nothing else will retry it this round) or a draft that does not match the brief. ' +
        'Pass steer to say what was wrong — without it the same references are picked and the same draft comes back. ' +
        'Not a way to poll: it returns immediately with status=pending, and generation takes a minute or two — ' +
        'keep building and call get_seed again later. Refused once you have staged files or delivered this round, ' +
        'and capped per job. If it is refused, continue from what you have rather than asking again.',
      inputSchema: {
        type: 'object',
        properties: {
          steer: {
            type: 'string',
            description:
              'What the current draft got wrong, in one or two sentences (max 600 chars). ' +
              'e.g. "the brief asks for a co-op party game; the draft built a single-player runner".',
          },
          sessionKey: SESSION_KEY_PROP,
        },
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const res = await injectChannel(ctx.request, 'POST', AGENT_CHANNEL_ROUTES.SEED_REGENERATE, auth.channelToken, {
          ...(typeof args.steer === 'string' ? { steer: args.steer } : {}),
        });
        const body = res.json() as { error?: string; message?: string; [key: string]: unknown };
        if (res.statusCode !== 200) {
          return toolErr(body.message ?? body.error ?? `regenerate_seed failed (${res.statusCode})`);
        }
        return toolOk(body);
      },
    },

    knowledge_query: {
      annotations: { title: 'Query GameKit/EditorKit/example-game knowledge', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['answer', 'chunks'] },
          fallback: { type: 'boolean' },
          answer: { type: 'string' },
          chunks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                repoPath: { type: 'string' },
                corpus: { type: 'string' },
                snippet: { type: 'string' },
              },
              required: ['repoPath', 'snippet'],
            },
          },
          repoPaths: { type: 'array', items: { type: 'string' } },
          indexedCommit: { type: 'string' },
          guidance: { type: 'string' },
          truncated: { type: 'boolean' },
          cached: { type: 'boolean' },
          ...WARNINGS_PROP,
        },
        required: ['mode', 'fallback', 'chunks', 'repoPaths', 'guidance', 'truncated', 'cached'],
      },
      description:
        'Ask a natural-language question about GameKit, EditorKit, the allowlisted example games, or platform ' +
        'docs/process — for capability and "how do I…" questions that get_kit_api and the kit browse tools do ' +
        "not cover. Answers a question web search cannot: this platform's docs are not public. " +
        'mode=answer (default) synthesizes prose with citations; it can fall back to raw chunks ' +
        '(fallback:true) when no answer could be generated even though relevant content exists — treat that ' +
        'the same as a normal chunks response. mode=chunks returns raw retrieved excerpts only, for ' +
        'grounding code generation in exact source. scope narrows retrieval: kit (GameKit API/modules), ' +
        'editor (EditorKit), examples (allowlisted example games), docs (process/spec/skill docs). ' +
        'Every response carries repoPaths and indexedCommit for attribution, and guidance to verify exact ' +
        'current API signatures via get_kit_api / read_kit_file rather than trusting prose alone. ' +
        'For kit API surface questions, call get_kit_api first.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          query: { type: 'string', description: 'Natural-language question (2–500 chars).' },
          mode: {
            type: 'string',
            enum: ['chunks', 'answer'],
            description: 'Default answer — synthesized prose for explanation/Q&A. chunks for raw grounding excerpts.',
          },
          scope: {
            type: 'string',
            enum: ['kit', 'editor', 'examples', 'docs'],
            description: 'Narrows retrieval; omit to search everything.',
          },
          engineRef: KIT_ENGINE_REF_PROP,
        },
        required: ['query'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const query = typeof args.query === 'string' ? args.query.trim() : '';
        if (!query) return toolErr('query is required');
        const params = new URLSearchParams({ query });
        if (args.mode === 'chunks' || args.mode === 'answer') params.set('mode', args.mode);
        if (args.scope === 'kit' || args.scope === 'editor' || args.scope === 'examples' || args.scope === 'docs') {
          params.set('scope', args.scope);
        }
        const res = await injectChannel(
          ctx.request,
          'GET',
          `${AGENT_CHANNEL_ROUTES.KNOWLEDGE_QUERY}?${params.toString()}`,
          auth.channelToken,
        );
        const body = res.json() as { error?: string; message?: string };
        if (res.statusCode !== 200) {
          return toolErr(body.message ?? body.error ?? `knowledge_query failed (${res.statusCode})`, body);
        }
        return toolOk(body);
      },
    },
  };
}
