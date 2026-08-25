import type { FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import {
  toolOk,
  toolErr,
  BEHAVIOURAL_CONTRACT,
  SESSION_KEY_PROP,
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

export interface ExampleToolsDeps {
  resolveAuth: (ctx: ToolContext, args: Record<string, unknown>) => Promise<{ channelToken: string } | ToolResult>;
  injectChannel: (
    request: FastifyRequest,
    method: 'GET',
    path: string,
    channelToken: string,
  ) => Promise<{ statusCode: number; json: () => unknown }>;
}

export interface ExampleToolEntry {
  annotations: { title: string } & typeof READS;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

// The curated first-party exemplar cluster: list, fetch, browse, and read inline.
export function createExampleTools(deps: ExampleToolsDeps): Record<string, ExampleToolEntry> {
  const { resolveAuth, injectChannel } = deps;

  return {
    list_examples: {
      annotations: { title: 'List exemplar games', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          examples: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                slug: { type: 'string' },
                title: { type: 'string' },
                genre: { type: 'string' },
                modules: { type: 'array', items: { type: 'string' } },
                whyReference: { type: 'string' },
              },
            },
          },
        },
        required: ['examples'],
      },
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
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const res = await injectChannel(ctx.request, 'GET', AGENT_CHANNEL_ROUTES.EXAMPLES, auth.channelToken);
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
      annotations: { title: 'Fetch one exemplar', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          title: { type: 'string' },
          tarballUrl: { type: 'string' },
          sha256: { type: 'string' },
          unpack: { type: 'string' },
        },
        required: ['slug', 'title', 'tarballUrl', 'unpack'],
      },
      description:
        'Fetch one allowlisted exemplar as a signed tarball URL. Unknown or non-allowlisted slugs fail. ' +
        'Requires a client that can fetch a URL — if yours cannot, use list_example_files and ' +
        'read_example_file instead, which return the same sources inline. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          slug: { type: 'string', description: 'Allowlisted exemplar slug from list_examples.' },
        },
        required: ['slug'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
        if (!slug) return toolErr('slug is required');
        const res = await injectChannel(
          ctx.request,
          'GET',
          `${AGENT_CHANNEL_ROUTES.EXAMPLES}/${encodeURIComponent(slug)}`,
          auth.channelToken,
        );
        const body = res.json() as { error?: string; message?: string };
        if (res.statusCode !== 200) {
          return toolErr(body.message ?? body.error ?? `example failed (${res.statusCode})`, body);
        }
        return toolOk(body);
      },
    },

    list_example_files: {
      annotations: { title: 'List an exemplar’s files', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                bytes: { type: 'number' },
                kind: { type: 'string', enum: ['text', 'binary'] },
              },
            },
          },
          total: { type: 'number' },
          truncated: { type: 'boolean', description: 'True when the limit cut the listing short.' },
        },
        required: ['slug', 'files', 'total', 'truncated'],
      },
      description:
        'List the source files inside an allowlisted exemplar game, without downloading its tarball. ' +
        'Use this (and read_example_file) when you cannot fetch URLs — get_example returns a link that ' +
        'a client without shell or network access cannot follow. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          slug: { type: 'string', description: 'Allowlisted exemplar slug from list_examples.' },
          prefix: { type: 'string', description: 'Optional path prefix to narrow the listing.' },
          limit: { type: 'integer', description: 'Max paths to return (default 200, max 500).' },
          offset: { type: 'integer', description: 'Skip this many matching paths.' },
        },
        required: ['slug'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
        if (!slug) return toolErr('slug is required');
        const query = new URLSearchParams();
        if (typeof args.prefix === 'string' && args.prefix.trim()) query.set('prefix', args.prefix.trim());
        if (typeof args.limit === 'number') query.set('limit', String(args.limit));
        if (typeof args.offset === 'number') query.set('offset', String(args.offset));
        const suffix = query.toString() ? `?${query.toString()}` : '';
        const res = await injectChannel(
          ctx.request,
          'GET',
          `${AGENT_CHANNEL_ROUTES.EXAMPLES}/${encodeURIComponent(slug)}/files${suffix}`,
          auth.channelToken,
        );
        const body = res.json() as { error?: string; message?: string };
        if (res.statusCode !== 200) {
          return toolErr(body.message ?? body.error ?? `example files failed (${res.statusCode})`, body);
        }
        return toolOk(body);
      },
    },

    read_example_file: {
      annotations: { title: 'Read one exemplar file', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          path: { type: 'string' },
          bytes: { type: 'number' },
          kind: { type: 'string', enum: ['text', 'binary'] },
          encoding: { type: 'string', enum: ['utf8', 'base64'] },
          content: { type: 'string' },
        },
        required: ['slug', 'path', 'bytes', 'kind', 'encoding', 'content'],
      },
      description:
        'Read one file from an allowlisted exemplar game, inline — no fetching required. ' +
        'Paths come from list_example_files and may be given relative (game.ts) or full (games/<slug>/game.ts). ' +
        'Binary files need encoding=base64. Large files are refused rather than truncated. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          slug: { type: 'string', description: 'Allowlisted exemplar slug from list_examples.' },
          path: { type: 'string', description: 'File path within the exemplar (e.g. SPEC.md or game.ts).' },
          encoding: { type: 'string', enum: ['utf8', 'base64'], description: 'utf8 for text (default).' },
        },
        required: ['slug', 'path'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
        const path = typeof args.path === 'string' ? args.path.trim() : '';
        if (!slug) return toolErr('slug is required');
        if (!path) return toolErr('path is required — call list_example_files to see what an exemplar contains');
        const query = new URLSearchParams({ path });
        if (args.encoding === 'utf8' || args.encoding === 'base64') query.set('encoding', args.encoding);
        const res = await injectChannel(
          ctx.request,
          'GET',
          `${AGENT_CHANNEL_ROUTES.EXAMPLES}/${encodeURIComponent(slug)}/file?${query.toString()}`,
          auth.channelToken,
        );
        const body = res.json() as { error?: string; message?: string };
        if (res.statusCode !== 200) {
          return toolErr(body.message ?? body.error ?? `example file failed (${res.statusCode})`, body);
        }
        return toolOk(body);
      },
    },
  };
}
