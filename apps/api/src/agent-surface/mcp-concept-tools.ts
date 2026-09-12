import type { FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import {
  toolOk,
  toolErr,
  SESSION_KEY_PROP,
  REPLY_CONTROL,
  BEHAVIOURAL_CONTRACT,
  CREATOR_TEXT_SAFETY,
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

// Posts a creator-visible card and spends the version's one proposal.
const CONSUMES = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export interface ConceptToolsDeps {
  resolveAuth: (ctx: ToolContext, args: Record<string, unknown>) => Promise<{ channelToken: string } | ToolResult>;
  injectChannel: (
    request: FastifyRequest,
    method: 'GET' | 'POST',
    path: string,
    channelToken: string,
    body?: Record<string, unknown>,
  ) => Promise<{ statusCode: number; json: () => unknown }>;
}

export interface ConceptToolEntry {
  annotations: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

const REFUSALS: Record<string, string> = {
  stopped: 'this round is closed',
  paused: 'concept proposals are switched off right now',
  muted: 'this creator asked not to be shown concept proposals',
  already_proposed: 'this delivery already carries a proposal',
  no_screenshot: 'no green gate capture to compare against — deliver and pass the gate first',
  frame_missing: 'a frameId is not a concept frame uploaded on this round',
  frame_stale: 'a concept frame came from an earlier round; draw this round its own',
  proposals_off: 'concept proposals are switched off right now',
  proposals_muted: 'this creator asked not to be shown concept proposals',
  no_capture: 'no green gate capture to draw on yet — deliver and pass the gate first',
  stale_delivery: 'this URL was issued for an earlier delivery; ask for a new one',
  too_many_shots: 'this build has no image slots left',
  frame_shape: 'a concept frame has a different aspect ratio than the gate capture',
  empty_text: 'a label or prompt is empty once markup is stripped; write plain text',
};

// Concept proposals an external agent draws with its own model.
export function createConceptTools(deps: ConceptToolsDeps): Record<string, ConceptToolEntry> {
  const { resolveAuth, injectChannel } = deps;

  return {
    concept_frame_upload_url: {
      annotations: { title: 'Get a concept frame upload URL', ...WRITES },
      outputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          expiresAt: { type: 'string' },
          expiresInSeconds: { type: 'number' },
          upload: { type: 'string' },
          maxBytes: { type: 'number' },
          issued: { type: 'boolean' },
          refused: { type: 'string' },
          ...REPLY_CONTROL,
        },
        required: [],
      },
      description:
        'Upload one image-model frame for a concept proposal. Same shape as screenshot_upload_url — a ' +
        'short-lived signed PUT URL, run the returned `upload` one-liner; PNG bytes must never enter the ' +
        'model as base64. The PUT answers with the stored frame id; keep it for suggest_next_round. ' +
        'The caption is set by the platform and always says the frame is AI-made, so do not pass one. ' +
        'Draw the frame by editing the gate capture (get_gate_media) rather than from nothing, and keep the ' +
        "game's own HUD untouched — a frame that reshapes the interface is refused. " +
        BEHAVIOURAL_CONTRACT,
      inputSchema: { type: 'object', properties: { sessionKey: SESSION_KEY_PROP }, required: [] },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const res = await injectChannel(ctx.request, 'POST', AGENT_CHANNEL_ROUTES.SHOT_UPLOAD_URL, auth.channelToken, {
          purpose: 'concept',
        });
        const body = res.json() as {
          error?: string;
          rejected?: string;
          url?: string;
          expiresAt?: string;
          expiresInSeconds?: number;
          upload?: string;
          maxBytes?: number;
          control?: { stop?: boolean; reason?: string };
          pending?: Array<{ id: string; text: string; createdAt: string }>;
        };
        if (res.statusCode !== 200) return toolErr(body.error ?? `concept frame upload URL failed (${res.statusCode})`);
        if (body.rejected) {
          // An answer, not an error: errors drop stop and inbox.
          return toolOk({
            issued: false,
            refused: REFUSALS[body.rejected] ?? body.rejected,
            ...channelControlFields(body),
            pendingMessages: pendingMessagesFromChannel(body),
          });
        }
        // Never invent an expiry or cap the channel did not state.
        if (
          typeof body.url !== 'string' ||
          !body.url ||
          typeof body.upload !== 'string' ||
          !body.upload ||
          typeof body.expiresAt !== 'string' ||
          typeof body.expiresInSeconds !== 'number' ||
          typeof body.maxBytes !== 'number'
        ) {
          return toolErr('concept frame upload URL reply was incomplete — retry');
        }
        return toolOk({
          url: body.url,
          expiresAt: body.expiresAt,
          expiresInSeconds: body.expiresInSeconds,
          upload: body.upload,
          maxBytes: body.maxBytes,
          ...channelControlFields(body),
          pendingMessages: pendingMessagesFromChannel(body),
        });
      },
    },

    suggest_next_round: {
      annotations: { title: 'Offer two concept directions', ...CONSUMES },
      outputSchema: {
        type: 'object',
        properties: {
          posted: { type: 'boolean' },
          version: { type: 'string' },
          refused: { type: 'string' },
          ...REPLY_CONTROL,
        },
        required: ['posted'],
      },
      description:
        'Offer the creator two visual directions for the next round, as a decision card in their studio. ' +
        'Each option needs a short label, the sentence a pick drafts into their composer, and the frameId ' +
        'of a frame you uploaded with concept_frame_upload_url. ' +
        'The real gate capture is attached by the platform, so the creator always compares your concepts ' +
        'against what the game actually looks like — you cannot supply that frame. ' +
        'One proposal per delivered version, and only after that delivery passed its gate. ' +
        'Refusals are normal and final for this round: `muted` means the creator asked not to see these, ' +
        '`paused` means the platform switched them off. Do not retry either — build on. ' +
        "Write the labels and prompts in the creator's language (get_brief.locales[0]) via the *Localized " +
        'fields, with plain English in the base fields. ' +
        CREATOR_TEXT_SAFETY +
        ' ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            description: 'Exactly two directions; a third would be a menu rather than a choice.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'Two or three words naming the direction, in English.' },
                prompt: {
                  type: 'string',
                  description: 'The sentence a pick drafts into the composer, in English. Never sent by itself.',
                },
                labelLocalized: { type: 'string', description: "The label in the creator's language." },
                promptLocalized: { type: 'string', description: "The prompt in the creator's language." },
                frameId: { type: 'string', description: 'Frame id returned by the concept frame upload.' },
              },
              required: ['label', 'prompt', 'frameId'],
            },
          },
        },
        required: ['options'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        if (!Array.isArray(args.options)) return toolErr('options must be an array of exactly two directions');
        const res = await injectChannel(ctx.request, 'POST', AGENT_CHANNEL_ROUTES.PROPOSAL, auth.channelToken, {
          options: args.options,
        });
        const body = res.json() as {
          error?: string;
          accepted?: boolean;
          rejected?: string;
          version?: string;
          control?: { stop?: boolean; reason?: string };
          pending?: Array<{ id: string; text: string; createdAt: string }>;
        };
        if (res.statusCode !== 200) return toolErr(body.error ?? `suggest_next_round failed (${res.statusCode})`);
        if (body.rejected) {
          return toolOk({
            posted: false,
            refused: REFUSALS[body.rejected] ?? body.rejected,
            ...channelControlFields(body),
            pendingMessages: pendingMessagesFromChannel(body),
          });
        }
        return toolOk({
          posted: true,
          ...(body.version ? { version: body.version } : {}),
          ...channelControlFields(body),
          pendingMessages: pendingMessagesFromChannel(body),
        });
      },
    },
  };
}
