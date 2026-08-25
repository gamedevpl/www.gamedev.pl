import type { FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES, GATE_STATUS_VALUES } from '@gamedevpl/contract';
import {
  toolOk,
  toolErr,
  BEHAVIOURAL_CONTRACT,
  SESSION_KEY_PROP,
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

export interface GateMediaToolsDeps {
  resolveAuth: (
    ctx: ToolContext,
    args: Record<string, unknown>,
    options?: { allowTerminalReceipt?: boolean },
  ) => Promise<{ channelToken: string } | ToolResult>;
  injectChannel: (
    request: FastifyRequest,
    method: 'GET' | 'POST',
    path: string,
    channelToken: string,
    body?: Record<string, unknown>,
  ) => Promise<{ statusCode: number; json: () => unknown }>;
}

export interface GateMediaToolEntry {
  annotations: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

// A card shows a strip, not a contact sheet.
const ROUND_MEDIA_MAX_FRAMES = 3;
const ROUND_MEDIA_BYTE_BUDGET = 1_500_000;

// The gate's verdict, plus view frames and model-visible frames.
export function createGateMediaTools(deps: GateMediaToolsDeps): Record<string, GateMediaToolEntry> {
  const { resolveAuth, injectChannel } = deps;

  return {
    get_gate_verdict: {
      annotations: { title: 'Check the gate once', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', ...GATE_STATUS_VALUES],
          },
          deliveryId: { type: ['string', 'null'] },
          summary: { type: 'string' },
          access: { type: 'string' },
          version: { type: 'string' },
          green: { type: 'boolean' },
          lane: { type: 'string', enum: ['preview', 'publish'] },
          ranAt: { type: 'string' },
          report: { type: 'string' },
          gateStatus: { type: 'string' },
          previewPassed: { type: 'boolean' },
          retryAfterSeconds: {
            type: 'number',
            description:
              'Informational delay before a later creator-led run checks again. stop:true takes priority in this run.',
          },
          stop: { type: 'boolean', description: 'When true, stop this agent run immediately.' },
          reason: { type: 'string' },
          ...WARNINGS_PROP,
        },
        required: ['status', 'deliveryId', 'summary', 'access', 'stop'],
      },
      description:
        'One-shot check of the gate verdict for a delivery (default: latest); this is not a polling or waiting tool. ' +
        'Preview lane: preview_passed / preview_failed ' +
        '(does not end the round). Publish lane: green / red / kit_outdated — only green ends the round. ' +
        'Verdicts typically land in 2–5 minutes. When status=pending and deliveryId is set, the result has stop:true: ' +
        'STOP this run immediately and let Studio show the eventual result. A pending result with deliveryId:null means ' +
        'you checked before delivering: stop is false, so continue building and call submit_sources instead of checking again. ' +
        'retryAfterSeconds is only for a later creator-led run checking a delivered gate. Repeated checks trigger warnings.code=gate_poll_backoff. ' +
        'kit_outdated is terminal — stop polling, re-run get_kit, then submit_sources({ fromLatestDelivery: true, mode, kitEngineRef }) ' +
        '(same mode as the refused delivery; omit mode only to reuse that lane; do not re-upload the whole tree; do not wait for green/red). ' +
        'Terminal receipt: still readable after the round closes ' +
        "when your capability's generation owns that delivery (generation may be exactly one behind current), " +
        'so the verdict stays readable if the round closes between polls. ' +
        'Expiry still applies. Wait for publish green before considering the round done. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          deliveryId: { type: 'string', description: "Delivery version id; default is the job's latest." },
        },
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args, { allowTerminalReceipt: true });
        if (!('channelToken' in auth)) return auth;

        const deliveryId =
          typeof args.deliveryId === 'string' && args.deliveryId.trim() ? args.deliveryId.trim() : null;
        const path = deliveryId
          ? `${AGENT_CHANNEL_ROUTES.GATE}?version=${encodeURIComponent(deliveryId)}`
          : AGENT_CHANNEL_ROUTES.GATE;
        const res = await injectChannel(ctx.request, 'GET', path, auth.channelToken);
        const body = res.json() as Record<string, unknown> & { error?: string; status?: string };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `gate verdict failed (${res.statusCode})`);
        }
        if (body.status === 'pending' && typeof body.deliveryId === 'string') {
          return toolOk({
            ...body,
            summary:
              'gate is still running — STOP this agent run now; do not call get_gate_verdict or any other tool again. Studio will show the eventual result.',
            stop: true,
            reason: 'gate_pending',
          });
        }
        if (body.status === 'pending') {
          return toolOk({
            ...body,
            summary:
              'nothing has been delivered yet — continue building and call submit_sources; do not call get_gate_verdict again before a delivery',
            stop: false,
            reason: 'no_delivery',
          });
        }
        if (body.status === 'green') {
          return toolOk({ ...body, stop: true, reason: 'gate_green' });
        }
        return toolOk({ ...body, stop: false });
      },
    },

    // App-only companion to get_gate_media; returns data URIs for the round view.
    get_round_media: {
      annotations: { title: 'Gate frames for the round view', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          available: { type: 'boolean' },
          deliveryId: { type: ['string', 'null'] },
          lane: { type: ['string', 'null'] },
          frames: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                file: { type: 'string' },
                name: { type: 'string' },
                png: { type: 'string', description: 'base64 PNG' },
              },
            },
          },
          video: { type: ['object', 'null'], properties: { file: { type: 'string' }, url: { type: 'string' } } },
          framesOmitted: { type: 'number', description: 'Frames the gate captured but this reply could not carry.' },
          reason: { type: 'string', description: 'Why there is nothing to show, when there is nothing to show.' },
        },
        required: ['available', 'frames'],
      },
      description:
        "The gate's own frames for a delivery, as base64 PNGs the round view can render, plus the gameplay " +
        'video link when one exists. Read-only, app-only, and presence-neutral like get_round_status.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          deliveryId: { type: 'string', description: "Delivery version id; default is the job's latest." },
        },
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args, { allowTerminalReceipt: true });
        if (!('channelToken' in auth)) return auth;

        const deliveryId =
          typeof args.deliveryId === 'string' && args.deliveryId.trim() ? args.deliveryId.trim() : null;
        const query = new URLSearchParams({ frames: 'all' });
        if (deliveryId) query.set('version', deliveryId);
        const res = await injectChannel(
          ctx.request,
          'GET',
          `${AGENT_CHANNEL_ROUTES.MEDIA}?${query.toString()}`,
          auth.channelToken,
        );
        const body = res.json() as Record<string, unknown> & {
          error?: string;
          frames?: Array<{ file?: string; name?: string; png?: string }>;
          video?: unknown;
          framesOmitted?: number;
          // Lane lives under the verdict — whichever run captured these frames.
          gate?: { lane?: unknown };
          reason?: string;
        };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `gate media failed (${res.statusCode})`);
        }

        // Frames re-capped here: postMessage carries less than the gate already allows.
        let budget = ROUND_MEDIA_BYTE_BUDGET;
        const frames: Array<{ file: string; name: string; png: string }> = [];
        let omitted = typeof body.framesOmitted === 'number' ? body.framesOmitted : 0;
        for (const frame of body.frames ?? []) {
          const png = typeof frame.png === 'string' ? frame.png : '';
          if (!png) continue;
          if (frames.length >= ROUND_MEDIA_MAX_FRAMES || png.length > budget) {
            omitted += 1;
            continue;
          }
          budget -= png.length;
          frames.push({ file: String(frame.file ?? ''), name: String(frame.name ?? frame.file ?? ''), png });
        }

        const lane = typeof body.gate?.lane === 'string' ? body.gate.lane : null;
        return toolOk({
          available: frames.length > 0 || Boolean(body.video),
          deliveryId: (body.deliveryId as string | undefined) ?? deliveryId,
          lane,
          frames,
          video: (body.video as Record<string, unknown> | undefined) ?? null,
          ...(omitted > 0 ? { framesOmitted: omitted } : {}),
          // Explains why nothing renders instead of an empty strip.
          ...(frames.length === 0 && !body.video && body.reason ? { reason: body.reason } : {}),
        });
      },
    },

    get_gate_media: {
      annotations: { title: "Fetch the gate's screenshots and video", ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          available: { type: 'boolean' },
          deliveryId: { type: ['string', 'null'] },
          screenshots: {
            type: 'array',
            items: {
              type: 'object',
              properties: { file: { type: 'string' }, url: { type: 'string' } },
              required: ['file', 'url'],
            },
          },
          video: {
            type: ['object', 'null'],
            properties: { file: { type: 'string' }, url: { type: 'string' } },
          },
          openingShot: {
            type: 'object',
            properties: { file: { type: 'string' }, attached: { type: 'boolean' } },
            required: ['file', 'attached'],
          },
          access: { type: 'string' },
        },
        required: ['available', 'deliveryId'],
      },
      description:
        'Fetch the media the gate itself produced for a delivery (default: latest). Screenshots come back ' +
        'BOTH as attached images (no fetching needed — use these) and as short-lived signed URLs; the ' +
        'gameplay MP4 is a URL only. ' +
        'Use it when you cannot run the game yourself — look at the attached frames for visual defects ' +
        '(blank canvas, missing sprites) before resubmitting, and show them to the creator. ' +
        'frames=opening (default) attaches one frame; frames=all attaches up to 3; frames=none skips them ' +
        'when you only want the URLs. ' +
        'If your client cannot open URLs, do not try and do not report the video as broken — hand the link ' +
        'to the creator, who can, and describe the game from the attached frames. ' +
        'Read-only over the gate run that already happened; it never triggers a build, and media exists only ' +
        'after a delivery has been gated. Terminal receipt: like get_gate_verdict, the latest delivery stays ' +
        'readable after green closes the round. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          deliveryId: { type: 'string', description: "Delivery version id; default is the job's latest." },
          frames: {
            type: 'string',
            enum: ['opening', 'all', 'none'],
            description:
              'How many screenshots to attach as images: opening (default, one), all (up to 3), none (URLs only).',
          },
        },
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args, { allowTerminalReceipt: true });
        if (!('channelToken' in auth)) return auth;

        const deliveryId =
          typeof args.deliveryId === 'string' && args.deliveryId.trim() ? args.deliveryId.trim() : null;
        const frames = args.frames === 'all' || args.frames === 'none' ? args.frames : 'opening';
        const query = new URLSearchParams({ frames });
        if (deliveryId) query.set('version', deliveryId);
        const res = await injectChannel(
          ctx.request,
          'GET',
          `${AGENT_CHANNEL_ROUTES.MEDIA}?${query.toString()}`,
          auth.channelToken,
        );
        const body = res.json() as Record<string, unknown> & {
          error?: string;
          frames?: Array<{ file?: string; name?: string; png?: string }>;
        };
        if (res.statusCode !== 200) {
          return toolErr(body.error ?? `gate media failed (${res.statusCode})`);
        }
        // Frames ride as image blocks, not inline JSON, to avoid doubling cost.
        const { frames: inlineFrames, ...rest } = body;
        const attached = (inlineFrames ?? []).filter((frame) => typeof frame.png === 'string' && frame.png);
        const structured = {
          ...rest,
          frames: attached.map((frame) => ({ file: frame.file, name: frame.name, attached: true })),
        };
        const result = toolOk(structured);
        for (const frame of attached) {
          result.content.push({ type: 'image', data: frame.png as string, mimeType: 'image/png' });
        }
        return result;
      },
    },
  };
}
