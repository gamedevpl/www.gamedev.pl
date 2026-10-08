import type { FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { canonicalAppBaseUrl } from '../platform/canonical-app-url.js';
import { DEFAULT_UPLOAD_URL_TTL_SECONDS, mintUploadToken } from './agent-upload-token.js';
import { UPLOAD_REQUEST_PROPS, uploadContract } from './upload-request.js';
import { InvalidUploadError } from '../platform/upload-error.js';
import { decodeRasterSourceContent, encodeRasterSourceContent, isRasterSourcePath } from '../platform/raster-source.js';
import { decodeCanonicalBase64Utf8, InvalidBase64Error } from '../platform/canonical-base64.js';
import { largeSourceFileHint } from '../creation/module-size.js';
import { stagedFileHint } from './staged-file-hint.js';
import type { SubmissionRecord } from '../platform/store.js';
import type { AgentTokenClaims } from '../platform/agent-token.js';
import {
  toolOk,
  toolErr,
  SESSION_KEY_PROP,
  REPLY_CONTROL,
  channelControlFields,
  pendingMessagesFromChannel,
  type ToolContext,
  type ToolHandler,
  type ToolResult,
} from './mcp-tool-support.js';

const WRITES = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const CONSUMES = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const MAX_STAGE_UPLOAD_BATCH = 50;

interface AuthedStageJob {
  jobId: number;
  record: SubmissionRecord;
  claims: Pick<AgentTokenClaims, 'roundGeneration'>;
  channelToken: string;
  actorUid: string;
  actorRevision?: number;
}

export interface SourceStageToolsDeps {
  resolveAuth: (ctx: ToolContext, args: Record<string, unknown>) => Promise<AuthedStageJob | ToolResult>;
  injectChannel: (
    request: FastifyRequest,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    channelToken: string,
    body?: Record<string, unknown>,
  ) => Promise<{ statusCode: number; json: () => unknown }>;
  agentTokenSecret: string | undefined;
  now: () => number;
  // N1: delivery's deliverable-path vocabulary, applied here without importing it.
  assertDeliverableSourcePath: (path: string) => string;
}

export interface SourceStageToolEntry {
  annotations: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

// Push new content into staging; get_sources lives in mcp-source-read-tools.
export function createSourceStageTools(deps: SourceStageToolsDeps): Record<string, SourceStageToolEntry> {
  const { resolveAuth, injectChannel, agentTokenSecret, now, assertDeliverableSourcePath } = deps;

  return {
    stage_upload_url: {
      outputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          expiresAt: { type: 'string' },
          expiresInSeconds: { type: 'number' },
          path: { type: 'string' },
          ...UPLOAD_REQUEST_PROPS,
          uploadScript: { type: 'string', description: 'Deprecated: chained curl commands; use uploads[].' },
          maxBytes: { type: 'number' },
          uploads: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                url: { type: 'string' },
                ...UPLOAD_REQUEST_PROPS,
                expiresAt: { type: 'string' },
                expiresInSeconds: { type: 'number' },
                maxBytes: { type: 'number' },
              },
              required: ['path', 'url', 'method', 'headers', 'expiresAt', 'expiresInSeconds', 'maxBytes'],
            },
          },
          rejected: {
            type: 'array',
            description: 'Paths in this batch that were refused, with why. The rest were minted.',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, reason: { type: 'string' } },
              required: ['path', 'reason'],
            },
          },
        },
      },
      // Not READS: each call mints a fresh nonce, so never idempotent.
      annotations: { title: 'Get stage upload URL(s)', ...WRITES },
      description:
        'Stage new or fully rewritten source file(s) when you can make HTTP uploads yourself. ' +
        'Mints upload URLs in batch: `paths: ["file1.ts", "file2.ts", ...]` covers several files per call ' +
        `(up to ${MAX_STAGE_UPLOAD_BATCH} paths per call; larger sets split into batches of ${MAX_STAGE_UPLOAD_BATCH}), cheaper than one call per file. \`path\` alone covers a single file. ` +
        "Returns short-lived upload contracts as data (path, url, method, headers, maxBytes per file): PUT each file's bytes to its url with exactly its headers, using whatever HTTP client you have; the URL alone is not a credential, the Authorization header is. The file bytes never enter the model; the PUT applies the same " +
        'validation as stage_source_file (path allowlist, size caps, module_too_large hint) and returns the ' +
        'staging receipt only — read stop/pendingMessages from your other channel tools. Then submit_sources({ fromStaged: true, … }). ' +
        'Use stage_source_file / patch_source_file when you have no shell.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          paths: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array of game-relative paths (e.g. ["game.ts", "game/render.ts", "GAME.json"]). MANDATORY FOR MULTIPLE FILES: Always pass changed files in batch (up to 50 paths per call; split into batches if staging more). Never emit individual stage_upload_url calls.',
          },
          path: {
            type: 'string',
            description:
              'Single game-relative path (e.g. "game.ts"). Use ONLY when staging a single lone file; if staging multiple files, you MUST use paths instead (up to 50 per batch).',
          },
          slug: { type: 'string' },
        },
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        if (!agentTokenSecret) return toolErr('the MCP build endpoint is not configured');
        const hasPath = typeof args.path === 'string' && args.path.trim().length > 0;
        const hasPaths = Array.isArray(args.paths) && args.paths.length > 0;
        if ((!hasPath && !hasPaths) || (hasPath && hasPaths)) {
          return toolErr(hasPath ? 'pass either path or paths, not both' : 'path or paths is required');
        }
        const rawPaths = (hasPaths ? (args.paths as unknown[]) : [args.path]).filter(
          (p): p is string => typeof p === 'string' && p.trim().length > 0,
        );
        if (rawPaths.length === 0) return toolErr('paths must contain at least one valid path');
        if (rawPaths.length > MAX_STAGE_UPLOAD_BATCH) {
          return toolErr(
            `too many paths in one request (max ${MAX_STAGE_UPLOAD_BATCH}; split into batches of up to ${MAX_STAGE_UPLOAD_BATCH})`,
          );
        }

        // One refused path used to cost the whole batch: forty-nine good URLs thrown
        // away, and the agent re-minting all fifty to learn which one was wrong.
        // A batch mints what it can and names what it refused; a lone path still
        // refuses outright, because there is nothing else to hand back.
        const validPaths: string[] = [];
        const rejected: Array<{ path: string; reason: string }> = [];
        for (const raw of rawPaths) {
          const trimmed = raw.trim();
          try {
            validPaths.push(assertDeliverableSourcePath(trimmed));
          } catch (error) {
            if (!(error instanceof InvalidUploadError)) throw error;
            if (!hasPaths) return toolErr(error.message);
            rejected.push({ path: trimmed, reason: error.message });
          }
        }
        if (validPaths.length === 0) {
          return toolErr(rejected[0]!.reason, { rejected });
        }

        const slug =
          typeof args.slug === 'string' && args.slug.trim() ? args.slug.trim() : (auth.record.slug ?? undefined);
        if (!slug && !auth.record.slug) {
          return toolErr('slug is required before staging — send the slug from get_brief / start');
        }
        if (auth.record.slug && slug && auth.record.slug !== slug) {
          return toolErr(`this build delivers to ${auth.record.slug}, not ${slug}`);
        }
        const generation = auth.record.roundGeneration ?? auth.claims.roundGeneration ?? 1;
        const ttlSeconds = DEFAULT_UPLOAD_URL_TTL_SECONDS;
        // One clock read: advertised expiresAt must match the signed exp.
        const issuedAt = now();
        const expiresAt = new Date(issuedAt + ttlSeconds * 1000).toISOString();

        if (hasPath) {
          const path = validPaths[0]!;
          const token = mintUploadToken(agentTokenSecret, {
            jobId: auth.jobId,
            roundGeneration: generation,
            kind: 'stage',
            path,
            actorUid: auth.actorUid,
            actorRevision: auth.actorRevision,
            now: issuedAt,
            ttlSeconds,
          });
          const url = `${canonicalAppBaseUrl()}${AGENT_CHANNEL_ROUTES.SOURCES_STAGE_UPLOAD}`;
          return toolOk({
            url,
            expiresAt,
            expiresInSeconds: ttlSeconds,
            path,
            ...uploadContract(url, token, path, 'text/plain; charset=utf-8'),
            maxBytes: 1_000_000,
          });
        }

        const uploads = validPaths.map((path) => {
          const token = mintUploadToken(agentTokenSecret, {
            jobId: auth.jobId,
            roundGeneration: generation,
            kind: 'stage',
            path,
            actorUid: auth.actorUid,
            actorRevision: auth.actorRevision,
            now: issuedAt,
            ttlSeconds,
          });
          const url = `${canonicalAppBaseUrl()}${AGENT_CHANNEL_ROUTES.SOURCES_STAGE_UPLOAD}`;
          return {
            path,
            url,
            ...uploadContract(url, token, path, 'text/plain; charset=utf-8'),
            expiresAt,
            expiresInSeconds: ttlSeconds,
            maxBytes: 1_000_000,
          };
        });

        return toolOk({
          uploads,
          uploadScript: uploads.map((u) => u.upload).join(' && '),
          expiresAt,
          expiresInSeconds: ttlSeconds,
          ...(rejected.length ? { rejected } : {}),
        });
      },
    },

    stage_source_file: {
      // Overwrites the same path if staged again, so it is not additive.
      annotations: { title: 'Stage one source file', ...CONSUMES },
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          path: { type: 'string' },
          bytes: { type: 'number' },
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
        required: ['ok', 'path', 'bytes', 'staged', 'stop', 'pendingMessages'],
      },
      description:
        'Upload ONE game source file into this round’s staging buffer (full rewrite) via inline content. ' +
        'Use stage_upload_url (PUT each file to its returned url with its returned headers) when you can make HTTP uploads yourself — re-emitting file contents ' +
        'as a tool argument burns output tokens. Use this tool for new files when you have no shell; ' +
        'for edits to an existing path use patch_source_file so you do not re-emit a whole large file. ' +
        'For a large tree, staging file-by-file avoids one giant submit_sources files[] payload, which some clients truncate. ' +
        'Call once per path, then submit_sources({ fromStaged: true, mode, kitEngineRef }). Overwrites the same path if staged again. ' +
        'After preview_failed / red (warnings.code=must_fix_gate), staging alone does not re-run the gate; the next submit_sources does. ' +
        'Keep modules modest — if hint warns the file is large, split into cohesive game/*.ts modules.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          path: { type: 'string', description: 'Game-relative path (e.g. game.ts, SPEC.md).' },
          content: { type: 'string', description: 'File contents (utf8 text, or base64 when encoding=base64).' },
          encoding: { type: 'string', enum: ['utf8', 'base64'] },
          slug: { type: 'string' },
        },
        required: ['path', 'content'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const path = typeof args.path === 'string' ? args.path.trim() : '';
        if (!path) return toolErr('path is required');
        if (typeof args.content !== 'string') return toolErr('content is required');
        let content = args.content;
        if (isRasterSourcePath(path)) {
          if (args.encoding === 'utf8') {
            return toolErr(`file ${path}: PNG/WebP must be sent as encoding=base64`);
          }
          try {
            content = encodeRasterSourceContent(decodeRasterSourceContent(path, args.content));
          } catch (error) {
            return toolErr(`file ${path}: ${error instanceof Error ? error.message : 'invalid raster'}`);
          }
        } else if (args.encoding === 'base64') {
          try {
            content = decodeCanonicalBase64Utf8(args.content);
          } catch (error) {
            if (error instanceof InvalidBase64Error) {
              return toolErr(`file ${path}: invalid base64 content`);
            }
            throw error;
          }
        }
        const slug =
          typeof args.slug === 'string' && args.slug.trim() ? args.slug.trim() : (auth.record.slug ?? undefined);
        const res = await injectChannel(ctx.request, 'PUT', AGENT_CHANNEL_ROUTES.SOURCES_STAGE, auth.channelToken, {
          path,
          content,
          ...(slug ? { slug } : {}),
        });
        const body = res.json() as {
          error?: string;
          accepted?: boolean;
          rejected?: string;
          path?: string;
          bytes?: number;
          hint?: string;
          manifestHint?: string;
          typecheckHint?: string;
          budgetHint?: string;
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
          return toolErr(body.error ?? `stage failed (${res.statusCode})`, body);
        }
        const hint =
          body.hint ??
          (typeof body.bytes === 'number' ? largeSourceFileHint(body.path ?? path, body.bytes, content) : null);
        const manifestHint = body.manifestHint ?? stagedFileHint(body.path ?? path, content);
        return toolOk({
          ok: body.accepted !== false,
          ...(body.rejected ? { rejected: body.rejected } : {}),
          path: body.path ?? path,
          bytes: body.bytes ?? 0,
          ...(hint ? { hint } : {}),
          staged: body.staged ?? { files: [], totalBytes: 0, maxBytes: 0, maxFiles: 0 },
          ...channelControlFields(body, [
            ...(manifestHint ? [{ code: 'game_manifest_invalid' as const, message: manifestHint }] : []),
            ...(hint ? [{ code: 'module_too_large' as const, message: hint }] : []),
            ...(body.typecheckHint ? [{ code: 'typecheck_hint' as const, message: body.typecheckHint }] : []),
            ...(body.audioHint ? [{ code: 'audio_catalog_hint' as const, message: body.audioHint }] : []),
            ...(body.budgetHint ? [{ code: 'byte_budget_low' as const, message: body.budgetHint }] : []),
          ]),
          pendingMessages: pendingMessagesFromChannel(body),
        });
      },
    },
  };
}
