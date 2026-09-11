import type { FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import {
  toolOk,
  toolErr,
  BEHAVIOURAL_CONTRACT,
  SESSION_KEY_PROP,
  KIT_ENGINE_REF_PROP,
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

export interface KitFileToolsDeps {
  resolveAuth: (ctx: ToolContext, args: Record<string, unknown>) => Promise<{ channelToken: string } | ToolResult>;
  injectChannel: (
    request: FastifyRequest,
    method: 'GET' | 'POST',
    path: string,
    channelToken: string,
    body?: Record<string, unknown>,
  ) => Promise<{ statusCode: number; json: () => unknown }>;
}

export interface KitFileToolEntry {
  annotations: { title: string } & typeof READS;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

// The Creator Kit read cluster: single file, batch, and windowed fragment reads.
export function createKitFileTools(deps: KitFileToolsDeps): Record<string, KitFileToolEntry> {
  const { resolveAuth, injectChannel } = deps;

  return {
    read_kit_file: {
      annotations: { title: 'Read one Creator Kit file', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          engineRef: { type: 'string' },
          path: { type: 'string' },
          bytes: { type: 'number' },
          kind: { type: 'string', enum: ['text', 'binary'] },
          encoding: { type: 'string', enum: ['utf8', 'base64'] },
          content: { type: 'string' },
        },
        required: ['engineRef', 'path', 'bytes', 'kind', 'encoding', 'content'],
      },
      description:
        'Read one small Creator Kit file (≤48 KiB). Use read_kit_files when fetching several known paths. ' +
        'Pass engineRef from get_kit. Larger files return kit_file_too_large — use read_kit_file_fragment. ' +
        'Binary files need encoding=base64. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          engineRef: KIT_ENGINE_REF_PROP,
          path: { type: 'string', description: 'Kit file path (e.g. SKILL.md or gamedevpl-creator-kit/SKILL.md).' },
          encoding: {
            type: 'string',
            enum: ['utf8', 'base64'],
            description: 'utf8 for text (default); base64 required for binary.',
          },
        },
        required: ['path'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const path = typeof args.path === 'string' ? args.path.trim() : '';
        if (!path) return toolErr('path is required');
        const params = new URLSearchParams({ path });
        if (typeof args.engineRef === 'string' && args.engineRef.trim()) {
          params.set('engineRef', args.engineRef.trim());
        }
        if (args.encoding === 'base64' || args.encoding === 'utf8') params.set('encoding', args.encoding);
        const res = await injectChannel(
          ctx.request,
          'GET',
          `${AGENT_CHANNEL_ROUTES.KIT_FILE}?${params.toString()}`,
          auth.channelToken,
        );
        const body = res.json() as { error?: string; message?: string };
        if (res.statusCode !== 200) {
          return toolErr(body.message ?? body.error ?? `read_kit_file failed (${res.statusCode})`, body);
        }
        return toolOk(body);
      },
    },

    read_kit_files: {
      annotations: { title: 'Read several Creator Kit files', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          engineRef: { type: 'string' },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ok: { type: 'boolean' },
                path: { type: 'string' },
                bytes: { type: 'number' },
                kind: { type: 'string', enum: ['text', 'binary'] },
                encoding: { type: 'string', enum: ['utf8', 'base64'] },
                content: { type: 'string' },
                error: { type: 'string' },
                message: { type: 'string' },
              },
              required: ['ok', 'path'],
            },
          },
          totalBytes: { type: 'number' },
          maxBytes: { type: 'number' },
          maxFiles: { type: 'number' },
          truncated: { type: 'boolean' },
        },
        required: ['engineRef', 'files', 'totalBytes', 'maxBytes', 'maxFiles', 'truncated'],
      },
      description:
        'Read up to 12 small Creator Kit files in one call (≤128 KiB aggregate), staying within per-turn ' +
        'tool-call limits. Pass engineRef from get_kit. ' +
        'Per-path failures stay in files[]; oversized files need read_kit_file_fragment. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          engineRef: KIT_ENGINE_REF_PROP,
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Kit file paths (1–12), e.g. ["SKILL.md", "starters/block-cascade/game.ts"].',
          },
          encoding: {
            type: 'string',
            enum: ['utf8', 'base64'],
            description: 'Optional override for every file; default is utf8 for text and base64 for binary.',
          },
        },
        required: ['paths'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        if (!Array.isArray(args.paths)) return toolErr('paths must be an array of strings');
        const paths = args.paths.filter((path): path is string => typeof path === 'string');
        if (paths.length === 0) return toolErr('paths must be a non-empty array');
        const body: Record<string, unknown> = { paths };
        if (typeof args.engineRef === 'string' && args.engineRef.trim()) {
          body.engineRef = args.engineRef.trim();
        }
        if (args.encoding === 'base64' || args.encoding === 'utf8') body.encoding = args.encoding;
        const res = await injectChannel(
          ctx.request,
          'POST',
          AGENT_CHANNEL_ROUTES.KIT_FILES_READ,
          auth.channelToken,
          body,
        );
        const payload = res.json() as { error?: string; message?: string };
        if (res.statusCode !== 200) {
          return toolErr(payload.message ?? payload.error ?? `read_kit_files failed (${res.statusCode})`, payload);
        }
        return toolOk(payload);
      },
    },

    read_kit_file_fragment: {
      annotations: { title: 'Read a Creator Kit file fragment', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          engineRef: { type: 'string' },
          path: { type: 'string' },
          kind: { type: 'string', enum: ['text', 'binary'] },
          unit: { type: 'string', enum: ['bytes', 'lines'] },
          offset: { type: 'number' },
          limit: { type: 'number' },
          totalBytes: { type: 'number' },
          totalLines: { type: ['number', 'null'] },
          encoding: { type: 'string', enum: ['utf8', 'base64'] },
          content: { type: 'string' },
          eof: { type: 'boolean' },
          nextOffset: { type: ['number', 'null'] },
        },
        required: [
          'engineRef',
          'path',
          'kind',
          'unit',
          'offset',
          'limit',
          'totalBytes',
          'totalLines',
          'encoding',
          'content',
          'eof',
          'nextOffset',
        ],
      },
      description:
        'Read a window of one Creator Kit file by lines (default) or bytes (always base64). ' +
        'Pass engineRef from get_kit. Use nextOffset for pagination. Overlong line windows error — switch to unit=bytes. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          engineRef: KIT_ENGINE_REF_PROP,
          path: { type: 'string', description: 'Kit file path.' },
          offset: { type: 'integer', description: '0-based start line or byte (use nextOffset from the prior reply).' },
          limit: { type: 'integer', description: 'Max lines (≤200) or bytes (≤32 KiB).' },
          unit: {
            type: 'string',
            enum: ['lines', 'bytes'],
            description: 'Default lines; bytes required for binary and always returns base64.',
          },
          encoding: {
            type: 'string',
            enum: ['utf8', 'base64'],
            description: 'utf8 for lines; base64 required for unit=bytes.',
          },
        },
        required: ['path'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const path = typeof args.path === 'string' ? args.path.trim() : '';
        if (!path) return toolErr('path is required');
        const params = new URLSearchParams({ path });
        if (typeof args.engineRef === 'string' && args.engineRef.trim()) {
          params.set('engineRef', args.engineRef.trim());
        }
        if (typeof args.offset === 'number' && Number.isFinite(args.offset)) params.set('offset', String(args.offset));
        if (typeof args.limit === 'number' && Number.isFinite(args.limit)) params.set('limit', String(args.limit));
        if (args.unit === 'lines' || args.unit === 'bytes') params.set('unit', args.unit);
        if (args.encoding === 'base64' || args.encoding === 'utf8') params.set('encoding', args.encoding);
        const res = await injectChannel(
          ctx.request,
          'GET',
          `${AGENT_CHANNEL_ROUTES.KIT_FILE_FRAGMENT}?${params.toString()}`,
          auth.channelToken,
        );
        const body = res.json() as { error?: string; message?: string };
        if (res.statusCode !== 200) {
          return toolErr(body.message ?? body.error ?? `read_kit_file_fragment failed (${res.statusCode})`, body);
        }
        return toolOk(body);
      },
    },
  };
}
