import type { FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { largeSourceFileHint } from '../creation/module-size.js';
import type { SubmissionRecord } from '../platform/store.js';
import {
  toolOk,
  toolErr,
  BEHAVIOURAL_CONTRACT,
  SESSION_KEY_PROP,
  REPLY_CONTROL,
  channelControlFields,
  pendingMessagesFromChannel,
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

interface AuthedPatchJob {
  record: SubmissionRecord;
  channelToken: string;
}

export interface SourcePatchToolsDeps {
  resolveAuth: (ctx: ToolContext, args: Record<string, unknown>) => Promise<AuthedPatchJob | ToolResult>;
  injectChannel: (
    request: FastifyRequest,
    method: 'GET' | 'POST',
    path: string,
    channelToken: string,
    body?: Record<string, unknown>,
  ) => Promise<{ statusCode: number; json: () => unknown }>;
}

export interface SourcePatchToolEntry {
  annotations: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

// Edit the staging buffer without re-uploading whole files, and manage it.
export function createSourcePatchTools(deps: SourcePatchToolsDeps): Record<string, SourcePatchToolEntry> {
  const { resolveAuth, injectChannel } = deps;

  return {
    patch_source_file: {
      // Replaces existing staged content, and a patch can remove lines outright.
      annotations: { title: 'Edit staged source files', ...CONSUMES },
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          path: { type: 'string' },
          bytes: { type: 'number' },
          replacements: { type: 'number' },
          baseFrom: { type: 'string', enum: ['staged', 'delivery', 'seed'] },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                bytes: { type: 'number' },
                replacements: { type: 'number' },
                baseFrom: { type: 'string', enum: ['staged', 'delivery', 'seed'] },
              },
              required: ['path', 'bytes', 'replacements', 'baseFrom'],
            },
          },
          incomplete: { type: 'boolean' },
          failed: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                index: { type: 'number' },
                error: { type: 'string' },
              },
              required: ['path', 'index', 'error'],
            },
          },
          hint: { type: 'string' },
          staged: {
            type: 'object',
            properties: {
              files: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { path: { type: 'string' }, bytes: { type: 'number' } },
                  required: ['path', 'bytes'],
                },
              },
              totalBytes: { type: 'number' },
              maxBytes: { type: 'number' },
              maxFiles: { type: 'number' },
            },
            required: ['files', 'totalBytes', 'maxBytes', 'maxFiles'],
          },
          ...REPLY_CONTROL,
        },
        required: ['ok', 'path', 'bytes', 'replacements', 'baseFrom', 'staged', 'stop', 'pendingMessages'],
      },
      description:
        'Edit existing path(s) in the staging buffer without re-uploading whole files. ' +
        'Edits a file that already exists (from get_sources, a prior stage, or the seed) without re-uploading it whole — ' +
        'especially useful for large game/render.ts or game/model.ts files. ' +
        'PRIMARY FORM: pass old + new (exact unique substring replace), or patches: [{ old, new }, ...] for multiple replacements in one file, ' +
        'or files: [{ path, old, new } | { path, patches: [{ old, new }] }, ...] to edit several files in one call — no @@ line numbers, no diff format. ' +
        'With patches[] / files[], replacements apply sequentially per file; ensure earlier replacements do not make a later old snippet ambiguous. ' +
        'Edits that apply are kept even if later ones miss — retry only failed[] (path + index), do not resend the ones that landed. Honour warnings.code=patch_incomplete. ' +
        'ALTERNATE: pass path + patch as a unified diff for that single file ' +
        '("--- a/game/render.ts\\n+++ b/game/render.ts\\n@@\\n context\\n-old\\n+new\\n context\\n"; bare @@ ok). ' +
        'old must match exactly once; widen the snippet if it is ambiguous. Do not mix files[] with top-level path/old/new/patches/patch. ' +
        'Then submit_sources({ fromStaged: true, mode, kitEngineRef }); fromStaged overlays onto the latest delivery/seed so you only need the patched paths staged. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          path: {
            type: 'string',
            description:
              'Game-relative path (e.g. game/render.ts). Required for single-file edits. For unified diffs, must match the ---/+++ headers. Omit when passing files[].',
          },
          old: {
            type: 'string',
            description:
              'Exact text to find (must appear once). Use old+new unless you need a unified diff (patch). Pass together with new.',
          },
          new: {
            type: 'string',
            description: 'Replacement text for old (may be empty to delete). Pass together with old.',
          },
          patches: {
            type: 'array',
            description: 'Array of { old, new } replacement pairs to apply sequentially to this file in one call.',
            items: {
              type: 'object',
              properties: {
                old: { type: 'string', description: 'Exact text to find.' },
                new: { type: 'string', description: 'Replacement text.' },
              },
              required: ['old', 'new'],
            },
          },
          files: {
            type: 'array',
            description:
              'Edit several files in one call. Each entry is { path, old, new } or { path, patches: [{ old, new }, ...] }. Do not pass top-level path/old/new/patches/patch with files[].',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Game-relative path.' },
                old: { type: 'string', description: 'Exact text to find (single replace).' },
                new: { type: 'string', description: 'Replacement text (single replace).' },
                patches: {
                  type: 'array',
                  description: 'Sequential { old, new } pairs for this file.',
                  items: {
                    type: 'object',
                    properties: {
                      old: { type: 'string' },
                      new: { type: 'string' },
                    },
                    required: ['old', 'new'],
                  },
                },
              },
              required: ['path'],
            },
          },
          patch: {
            type: 'string',
            description:
              'Unified diff for this one file only (alternative to old+new, patches, or files[]). Bare `@@` hunks are fine when context matches.',
          },
          slug: { type: 'string' },
        },
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const path = typeof args.path === 'string' ? args.path.trim() : '';
        const hasFiles = Array.isArray(args.files) && args.files.length > 0;
        const hasPatch = typeof args.patch === 'string' && args.patch.trim().length > 0;
        const hasOld = typeof args.old === 'string';
        const hasNew = typeof args.new === 'string';
        const hasPatches = Array.isArray(args.patches) && args.patches.length > 0;

        if (hasFiles && (path || hasPatch || hasOld || hasNew || hasPatches)) {
          return toolErr('pass files[] alone, or a single-file path with old+new / patches[] / patch');
        }
        if (!hasFiles && !path) return toolErr('path is required unless files[] is passed');
        const modes = [hasPatch, hasOld || hasNew, hasPatches].filter(Boolean).length;
        if (!hasFiles && modes > 1) {
          return toolErr(
            'pass either old+new (single exact replace), patches[] (multi-replace), files[], or patch (unified diff)',
          );
        }
        if (hasOld !== hasNew) {
          return toolErr('old and new must be passed together');
        }
        if (!hasFiles && modes === 0) {
          return toolErr('pass old+new, patches[] (multi-replace), files[], or patch (unified diff)');
        }
        const slug =
          typeof args.slug === 'string' && args.slug.trim() ? args.slug.trim() : (auth.record.slug ?? undefined);
        const res = await injectChannel(
          ctx.request,
          'POST',
          AGENT_CHANNEL_ROUTES.SOURCES_STAGE_PATCH,
          auth.channelToken,
          hasFiles
            ? { files: args.files, ...(slug ? { slug } : {}) }
            : {
                path,
                ...(hasPatches
                  ? { patches: args.patches }
                  : hasPatch
                    ? { patch: args.patch }
                    : { old: args.old, new: args.new }),
                ...(slug ? { slug } : {}),
              },
        );
        const body = res.json() as {
          error?: string;
          accepted?: boolean;
          rejected?: string;
          path?: string;
          bytes?: number;
          replacements?: number;
          baseFrom?: 'staged' | 'delivery' | 'seed';
          files?: Array<{
            path: string;
            bytes: number;
            replacements: number;
            baseFrom: 'staged' | 'delivery' | 'seed';
          }>;
          incomplete?: boolean;
          failed?: Array<{ path: string; index: number; error: string }>;
          hint?: string;
          manifestHint?: string;
          typecheckHint?: string;
          audioHint?: string;
          staged?: {
            files: Array<{ path: string; bytes: number }>;
            totalBytes: number;
            maxBytes: number;
            maxFiles: number;
          };
          control?: { stop?: boolean; reason?: string };
          pending?: Array<{ id: string; text: string; createdAt: string }>;
        };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `patch failed (${res.statusCode})`, body);
        }
        const hint =
          body.hint ?? (typeof body.bytes === 'number' ? largeSourceFileHint(body.path ?? path, body.bytes) : null);
        return toolOk({
          ok: body.accepted !== false,
          ...(body.rejected ? { rejected: body.rejected } : {}),
          path: body.path ?? path,
          bytes: body.bytes ?? 0,
          replacements: body.replacements ?? 0,
          baseFrom: body.baseFrom ?? 'staged',
          ...(body.files ? { files: body.files } : {}),
          ...(body.incomplete ? { incomplete: true } : {}),
          ...(body.failed && body.failed.length > 0 ? { failed: body.failed } : {}),
          ...(hint ? { hint } : {}),
          staged: body.staged ?? { files: [], totalBytes: 0, maxBytes: 0, maxFiles: 0 },
          ...channelControlFields(body, [
            ...(body.manifestHint ? [{ code: 'game_manifest_invalid' as const, message: body.manifestHint }] : []),
            ...(hint ? [{ code: 'module_too_large' as const, message: hint }] : []),
            ...(body.typecheckHint ? [{ code: 'typecheck_hint' as const, message: body.typecheckHint }] : []),
            ...(body.audioHint ? [{ code: 'audio_catalog_hint' as const, message: body.audioHint }] : []),
            ...(body.failed && body.failed.length > 0
              ? [
                  {
                    code: 'patch_incomplete' as const,
                    message:
                      `${body.failed.length} edit${body.failed.length === 1 ? '' : 's'} did not apply — ` +
                      'retry only failed[] (path + index). Do not resend edits that already landed.',
                  },
                ]
              : []),
          ]),
          pendingMessages: pendingMessagesFromChannel(body),
        });
      },
    },

    list_staged_sources: {
      annotations: { title: 'List staged source files', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, bytes: { type: 'number' } },
              required: ['path', 'bytes'],
            },
          },
          totalBytes: { type: 'number' },
          maxBytes: { type: 'number' },
          maxFiles: { type: 'number' },
          updatedAt: { type: ['string', 'null'] },
        },
        required: ['files', 'totalBytes', 'maxBytes', 'maxFiles', 'updatedAt'],
      },
      description:
        'List paths currently in the staging buffer (no contents). Use after stage_source_file / patch_source_file ' +
        'to confirm changed paths before submit_sources({ fromStaged: true, … }). ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: { sessionKey: SESSION_KEY_PROP },
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const res = await injectChannel(ctx.request, 'GET', AGENT_CHANNEL_ROUTES.SOURCES_STAGE, auth.channelToken);
        const body = res.json() as {
          error?: string;
          files?: Array<{ path: string; bytes: number }>;
          totalBytes?: number;
          maxBytes?: number;
          maxFiles?: number;
          updatedAt?: string | null;
        };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `list staged failed (${res.statusCode})`, body);
        }
        return toolOk({
          files: body.files ?? [],
          totalBytes: body.totalBytes ?? 0,
          maxBytes: body.maxBytes ?? 0,
          maxFiles: body.maxFiles ?? 0,
          updatedAt: body.updatedAt ?? null,
        });
      },
    },

    clear_staged_sources: {
      // Idempotent like ack_inbox — clearing twice leaves the same result.
      annotations: { title: 'Clear staged source files', ...CONSUMES, idempotentHint: true },
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          cleared: { type: 'number' },
          ...REPLY_CONTROL,
        },
        required: ['ok', 'cleared', 'stop', 'pendingMessages'],
      },
      description:
        'Clear the staging buffer (all paths, or only paths[]). Use before re-staging a clean tree. ' +
        'Successful submit_sources({ fromStaged: true }) also clears automatically. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional subset to clear; omit to clear everything.',
          },
        },
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const paths = Array.isArray(args.paths)
          ? args.paths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
          : undefined;
        const res = await injectChannel(
          ctx.request,
          'POST',
          AGENT_CHANNEL_ROUTES.SOURCES_STAGE_CLEAR,
          auth.channelToken,
          paths?.length ? { paths } : {},
        );
        const body = res.json() as {
          error?: string;
          accepted?: boolean;
          cleared?: number;
          control?: { stop?: boolean; reason?: string };
          pending?: Array<{ id: string; text: string; createdAt: string }>;
        };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `clear staged failed (${res.statusCode})`, body);
        }
        return toolOk({
          ok: body.accepted !== false,
          cleared: body.cleared ?? 0,
          ...channelControlFields(body),
          pendingMessages: pendingMessagesFromChannel(body),
        });
      },
    },
  };
}
