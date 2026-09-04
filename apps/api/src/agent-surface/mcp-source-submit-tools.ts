import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { decodeRasterSourceContent, encodeRasterSourceContent, isRasterSourcePath } from '../platform/raster-source.js';
import { decodeCanonicalBase64Utf8, InvalidBase64Error } from '../platform/canonical-base64.js';
import { selfBuildDeliveryCap } from '../platform/self-build-delivery-cap.js';
import { MAX_UPLOAD_FILES } from '../delivery/games-store.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
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

const CONSUMES = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const MAX_SUBMIT_FILES = MAX_UPLOAD_FILES;

interface AuthedSubmitJob {
  jobId: number;
  record: SubmissionRecord;
  channelToken: string;
}

export interface SourceSubmitToolsDeps {
  resolveAuth: (ctx: ToolContext, args: Record<string, unknown>) => Promise<AuthedSubmitJob | ToolResult>;
  injectChannel: (
    request: FastifyRequest,
    method: 'GET' | 'POST',
    path: string,
    channelToken: string,
    body?: Record<string, unknown>,
  ) => Promise<{ statusCode: number; json: () => unknown }>;
  store: Store | undefined;
}

export interface SourceSubmitToolEntry {
  annotations: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

// Drop a staged path, then deliver sources to the gate.
export function createSourceSubmitTools(deps: SourceSubmitToolsDeps): Record<string, SourceSubmitToolEntry> {
  const { resolveAuth, injectChannel, store } = deps;

  return {
    delete_source_file: {
      annotations: { title: 'Delete one staged source file', ...CONSUMES },
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          path: { type: 'string' },
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
        required: ['ok', 'path', 'staged', 'stop', 'pendingMessages'],
      },
      description:
        'Explicitly remove path from the delivered game — the opposite of stage_source_file. ' +
        'stage_source_file({ content: "" }) still delivers a live empty file at that path; this instead drops ' +
        'the path from the next submit_sources({ fromStaged: true }) delivery entirely, same as if it had ' +
        'never existed. Use to retire an old game/*.ts module no longer imported anywhere, or to clear a ' +
        'leftover index.html/GAME.json field back to the platform default — index.html cannot be re-staged ' +
        '(only removed); GAME.json.howToPlay is the only markup source now. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          path: { type: 'string', description: 'Game-relative path to remove (e.g. game/old-module.ts).' },
        },
        required: ['path'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const path = typeof args.path === 'string' ? args.path.trim() : '';
        if (!path) return toolErr('path is required');
        const res = await injectChannel(
          ctx.request,
          'POST',
          AGENT_CHANNEL_ROUTES.SOURCES_STAGE_DELETE,
          auth.channelToken,
          { path },
        );
        const body = res.json() as {
          error?: string;
          accepted?: boolean;
          rejected?: string;
          path?: string;
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
          return toolErr(body.error ?? `delete failed (${res.statusCode})`);
        }
        return toolOk({
          ok: body.accepted !== false,
          ...(body.rejected ? { rejected: body.rejected } : {}),
          path: body.path ?? path,
          staged: body.staged ?? { files: [], totalBytes: 0, maxBytes: 0, maxFiles: 0 },
          ...channelControlFields(body),
          pendingMessages: pendingMessagesFromChannel(body),
        });
      },
    },

    submit_sources: {
      annotations: { title: 'Deliver sources to the gate', ...CONSUMES },
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          rejected: { type: 'string' },
          mode: { type: 'string', enum: ['preview', 'publish'] },
          deliveryId: { type: ['string', 'null'] },
          delivery: {
            type: ['object', 'null'],
            properties: {
              slug: { type: 'string' },
              version: { type: 'string' },
            },
          },
          gateStarted: {
            type: 'boolean',
            description:
              'True when Cloud Build accepted the gate create (HTTP 2xx), with or without a parseable build id. ' +
              'False means the delivery was stored but the gate did not start — do not assume a preview is assembling.',
          },
          buildId: {
            type: 'string',
            description:
              'Cloud Build id when the create response included one (may be absent even when gateStarted is true).',
          },
          deliveriesRemaining: { type: ['number', 'null'] },
          ...REPLY_CONTROL,
        },
        required: [
          'ok',
          'mode',
          'deliveryId',
          'delivery',
          'gateStarted',
          'deliveriesRemaining',
          'stop',
          'pendingMessages',
        ],
      },
      description:
        `Deliver game sources. Stage changed paths with stage_source_file / patch_source_file, then pass fromStaged=true ` +
        `(fromStaged overlays onto the latest delivery/seed — do not re-stage unchanged files). ` +
        `On kit_outdated: get_kit then fromLatestDelivery=true with the same mode and new kitEngineRef — do NOT re-upload the whole tree. ` +
        `mode=preview (iterate): TRACE/PLAYTEST not required; runs typecheck→smoke→build; Studio gets a draft. ` +
        `mode=publish (seal): TRACE.json + PLAYTEST.json required; full gate; only publish green ends the round. ` +
        `Omitting mode defaults to publish, except with fromLatestDelivery (reuses the previous candidate's lane). ` +
        `files[{path, content, encoding utf8|base64}] optional when fromStaged/fromLatestDelivery (inline paths override); ≤${MAX_SUBMIT_FILES}; kitEngineRef required. ` +
        'Subject to delivery cap and filename allowlist. Reply includes stop and pendingMessages. ' +
        'gateStarted is true when Cloud Build accepted the gate create — not merely when the upload was accepted. ' +
        'A successful delivery unlocks creator handoff (agentEndedAt); still call end when you will not deliver more (warnings.code=call_end). ' +
        'Pass summary — one sentence of what changed this delivery; Studio shows it on the build list. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          fromStaged: {
            type: 'boolean',
            description:
              'Assemble staging (stage_source_file / patch_source_file), overlaid on the latest delivery and seed. ' +
              'Use this for large trees and for one-file patches. When true, files[] may be omitted (or used as path overrides). ' +
              'Not with fromLatestDelivery.',
          },
          fromLatestDelivery: {
            type: 'boolean',
            description:
              'Re-deliver the job’s latest candidate from the store (no re-upload). Use after kit_outdated: ' +
              'get_kit → submit_sources({ fromLatestDelivery:true, mode, kitEngineRef }). Pass the same mode ' +
              'as the refused delivery (preview stays preview); if mode is omitted the previous lane is inferred. ' +
              'Optional files[] overlay only the paths you changed. Not with fromStaged.',
          },
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
          mode: {
            type: 'string',
            enum: ['preview', 'publish'],
            description:
              'preview = iterate without TRACE (Studio draft). publish = sealed candidate (TRACE required). ' +
              'Default publish when omitted, except fromLatestDelivery reuses the previous candidate lane.',
          },
          slug: { type: 'string' },
          note: { type: 'string' },
          summary: {
            type: 'string',
            description:
              'One sentence of what changed in this delivery (≤1024 chars). Studio shows it on the build list. ' +
              'Write what the creator should read — not a file dump. end({ summary }) can refine the same sentence later.',
          },
        },
        required: ['kitEngineRef'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;

        const fromStaged = args.fromStaged === true;
        const fromLatestDelivery = args.fromLatestDelivery === true;
        if (fromStaged && fromLatestDelivery) {
          return toolErr('fromStaged and fromLatestDelivery cannot both be true — pick one');
        }
        const filesParse = z
          .array(
            z.object({
              path: z.string().trim().min(1).max(120),
              content: z.string(),
              encoding: z.enum(['utf8', 'base64']).optional(),
            }),
          )
          .max(MAX_SUBMIT_FILES)
          .optional()
          .safeParse(args.files);
        if (!filesParse.success) {
          return toolErr(filesParse.error.issues[0]?.message ?? 'invalid files');
        }
        const inlineFiles = filesParse.data ?? [];
        if (!fromStaged && !fromLatestDelivery && inlineFiles.length === 0) {
          return toolErr(
            'submit_sources needs files[], fromStaged=true after stage_source_file, or fromLatestDelivery=true. ' +
              'On kit_outdated: get_kit then submit_sources({ fromLatestDelivery: true, mode, kitEngineRef }). ' +
              'For large first trees: stage_source_file each path, then fromStaged=true.',
          );
        }

        const kitEngineRef = typeof args.kitEngineRef === 'string' ? args.kitEngineRef.trim() : '';
        if (!kitEngineRef) {
          return toolErr('kitEngineRef is required — send the engineRef from get_kit / kit.json');
        }

        // Passed through only if set; omitted infers the previous lane.
        const mode = args.mode === 'preview' || args.mode === 'publish' ? args.mode : undefined;

        const decodedFiles: Array<{ path: string; content: string }> = [];
        for (const file of inlineFiles) {
          if (isRasterSourcePath(file.path)) {
            if (file.encoding === 'utf8') {
              return toolErr(`file ${file.path}: PNG/WebP must be sent as encoding=base64`);
            }
            try {
              decodedFiles.push({
                path: file.path,
                content: encodeRasterSourceContent(decodeRasterSourceContent(file.path, file.content)),
              });
            } catch (error) {
              return toolErr(`file ${file.path}: ${error instanceof Error ? error.message : 'invalid raster'}`);
            }
            continue;
          }
          if (file.encoding === 'base64') {
            try {
              decodedFiles.push({ path: file.path, content: decodeCanonicalBase64Utf8(file.content) });
            } catch (error) {
              if (error instanceof InvalidBase64Error) {
                return toolErr(`file ${file.path}: invalid base64 content`);
              }
              throw error;
            }
          } else {
            decodedFiles.push({ path: file.path, content: file.content });
          }
        }

        const slug =
          typeof args.slug === 'string' && args.slug.trim() ? args.slug.trim() : (auth.record.slug ?? 'game');
        const summary =
          typeof args.summary === 'string' && args.summary.trim()
            ? args.summary.trim()
            : typeof args.note === 'string' && args.note.trim()
              ? args.note.trim()
              : undefined;

        const res = await injectChannel(ctx.request, 'POST', AGENT_CHANNEL_ROUTES.SOURCES, auth.channelToken, {
          slug,
          ...(decodedFiles.length ? { files: decodedFiles } : {}),
          ...(fromStaged ? { fromStaged: true } : {}),
          ...(fromLatestDelivery ? { fromLatestDelivery: true } : {}),
          kitEngineRef,
          ...(mode ? { mode } : {}),
          ...(summary ? { summary } : {}),
        });
        const body = res.json() as {
          error?: string;
          reason?: string;
          accepted?: boolean;
          rejected?: string;
          mode?: string;
          delivery?: { slug: string; version: string };
          deliveryCap?: number;
          deliveriesUsed?: number;
          gateStarted?: boolean;
          buildId?: string;
          control?: { stop?: boolean; reason?: string };
          pending?: Array<{ id: string; text: string; createdAt: string }>;
        };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `submit failed (${res.statusCode})`, body);
        }

        const cap = auth.record.builder === 'self' ? selfBuildDeliveryCap() : null;
        const used =
          (await store!.getSubmission(auth.jobId))?.roundDeliveryCount ?? auth.record.roundDeliveryCount ?? 0;

        const accepted = body.accepted !== false;
        const gateStarted = body.gateStarted === true;
        // Marks ended here since agents often submit without calling end.
        if (accepted && store) {
          await store.markAgentEnded(auth.jobId, undefined, 'submit').catch(() => {});
        }
        const warnings: Array<{ code: string; message: string }> = [];
        if (accepted) {
          warnings.push({
            code: 'call_end',
            message:
              'Call end when you will not deliver more this round (sets stop:true). ' +
              'Creator handoff is already unlocked from this submit; without end your session may look finished while still connected. ' +
              'Call end instead of sitting in a get_gate_verdict loop — Studio shows the gate. ' +
              'If you need an already-available verdict to keep iterating, call get_gate_verdict once; a pending delivery returns stop:true and ends this run.',
          });
          if (!gateStarted) {
            warnings.push({
              code: 'gate_not_started',
              message:
                'Delivery accepted but the gate did not start (no Cloud Build id). ' +
                'Do not assume a Studio preview is assembling — retry submit_sources or tell the creator.',
            });
          }
        }
        return toolOk({
          ok: accepted,
          mode: body.mode === 'preview' ? 'preview' : 'publish',
          ...(body.rejected ? { rejected: body.rejected } : {}),
          deliveryId: body.delivery?.version ?? null,
          delivery: body.delivery ?? null,
          gateStarted,
          ...(typeof body.buildId === 'string' && body.buildId ? { buildId: body.buildId } : {}),
          deliveriesRemaining: cap === null ? null : Math.max(0, cap - used),
          ...channelControlFields(body, warnings),
          pendingMessages: pendingMessagesFromChannel(body),
        });
      },
    },
  };
}
