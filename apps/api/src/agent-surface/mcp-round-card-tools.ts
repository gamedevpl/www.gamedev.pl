import type { FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { canonicalAppBaseUrl } from '../platform/canonical-app-url.js';
import { selfBuildDeliveryCap } from '../platform/self-build-delivery-cap.js';
import { detectStall, resolveJobState, toSubmissionStatus } from '../creation/job-state.js';
import type { AgentTokenAccess } from './agent-token.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
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

interface AuthedRoundJob {
  jobId: number;
  record: SubmissionRecord;
  access: AgentTokenAccess;
  channelToken: string;
}

export interface RoundCardToolsDeps {
  resolveAuth: (
    ctx: ToolContext,
    args: Record<string, unknown>,
    options?: { allowTerminalReceipt?: boolean },
  ) => Promise<AuthedRoundJob | ToolResult>;
  injectChannel: (
    request: FastifyRequest,
    method: 'GET' | 'POST',
    path: string,
    channelToken: string,
    body?: Record<string, unknown>,
  ) => Promise<{ statusCode: number; json: () => unknown }>;
  store: Store | undefined;
  now: () => number;
}

export interface RoundCardToolEntry {
  annotations: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

function noteTextFor(event: { text: string; textLocalized?: string; locale?: string }, readerLocale: unknown): string {
  if (!event.textLocalized || typeof event.locale !== 'string') return event.text;
  if (typeof readerLocale !== 'string' || !readerLocale) return event.text;
  const primary = (value: string) => value.trim().toLowerCase().split(/[-_]/)[0];
  return primary(event.locale) === primary(readerLocale) ? event.textLocalized : event.text;
}

// Shared by show_round and get_round_status; keeps both describing one round.
const ROUND_STATUS_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    phase: { type: 'string', description: 'Internal job state.' },
    status: { type: 'string', description: 'Creator-facing projection of the phase.' },
    stall: { type: ['string', 'null'] },
    agentEnded: { type: 'boolean' },
    title: { type: ['string', 'null'] },
    slug: { type: ['string', 'null'] },
    round: { type: 'number' },
    deliveriesRemaining: { type: ['number', 'null'] },
    note: {
      type: ['object', 'null'],
      properties: { text: { type: 'string' }, createdAt: { type: 'string' } },
    },
    shot: {
      type: ['object', 'null'],
      properties: {
        id: { type: 'string' },
        createdAt: { type: 'string' },
        label: { type: ['string', 'null'] },
        png: { type: 'string', description: 'base64 PNG; omitted when unchanged since sinceShotId.' },
      },
    },
    gate: { type: ['object', 'null'] },
    retryAfterSeconds: { type: 'number' },
  },
  required: ['phase', 'status', 'retryAfterSeconds'],
};

// canonicalAppBaseUrl, not WEB_ORIGIN, so the Play link stays allowlisted.
function playUrlFor(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `${canonicalAppBaseUrl()}/play/${encodeURIComponent(slug)}`;
}

function studioUrlFor(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `${canonicalAppBaseUrl()}/studio/${encodeURIComponent(slug)}`;
}

function siteUrl(): string {
  return canonicalAppBaseUrl();
}

// How often the round view should re-poll status.
const ROUND_STATUS_RETRY_AFTER_SECONDS = 30;

// The creator-facing round card: show_round, show_media, and the view poll.
export function createRoundCardTools(deps: RoundCardToolsDeps): Record<string, RoundCardToolEntry> {
  const { resolveAuth, injectChannel, store, now } = deps;

  async function roundStatusHandler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const auth = await resolveAuth(ctx, args, { allowTerminalReceipt: true });
    if (!('channelToken' in auth)) return auth;
    if (!store) return toolErr('the MCP build endpoint is not configured');

    const record = auth.record;
    const state = resolveJobState(record) ?? 'queued';
    const stall = detectStall({
      state,
      stateSince: record.stateSince ?? new Date(now()).toISOString(),
      ...(record.lastAgentSignalAt ? { lastAgentSignalAt: record.lastAgentSignalAt } : {}),
      ...(record.agentEndedAt ? { agentEndedAt: record.agentEndedAt } : {}),
      ...(record.builder ? { builder: record.builder } : {}),
      now: now(),
    });

    const [events, shots] = await Promise.all([
      store.listBuildEvents(auth.jobId, { limit: 1 }),
      store.listBuildShots(auth.jobId, { limit: 1 }),
    ]);

    const latestEvent = events[0];
    const latestShot = shots[0];
    const sinceShotId = typeof args.sinceShotId === 'string' ? args.sinceShotId.trim() : '';
    let shot: Record<string, unknown> | null = null;
    if (latestShot) {
      // Bytes sent only when the view does not already hold this frame.
      const full = latestShot.id !== sinceShotId ? await store.getBuildShot(auth.jobId, latestShot.id) : null;
      shot = {
        id: latestShot.id,
        createdAt: latestShot.createdAt,
        label: latestShot.labelLocalized ?? latestShot.label ?? null,
        ...(full ? { png: full.data } : {}),
      };
    }

    const cap = record.builder === 'self' ? selfBuildDeliveryCap() : null;
    const used = record.roundDeliveryCount ?? 0;

    // Verdict follows the latest delivery; terminal receipts still read after close.
    let gate: unknown = null;
    if (used > 0 || auth.access === 'terminal_receipt') {
      const gateRes = await injectChannel(ctx.request, 'GET', AGENT_CHANNEL_ROUTES.GATE, auth.channelToken);
      if (gateRes.statusCode === 200) gate = gateRes.json();
    }

    return toolOk({
      phase: state,
      status: toSubmissionStatus(state),
      stall: stall ?? null,
      agentEnded: Boolean(record.agentEndedAt),
      title: record.title ?? null,
      slug: record.slug ?? null,
      playUrl: playUrlFor(record.slug),
      studioUrl: studioUrlFor(record.slug),
      siteUrl: siteUrl(),
      round: record.roundGeneration ?? 1,
      deliveriesRemaining: cap === null ? null : Math.max(0, cap - used),
      note: latestEvent ? { text: noteTextFor(latestEvent, args.locale), createdAt: latestEvent.createdAt } : null,
      shot,
      gate,
      retryAfterSeconds: ROUND_STATUS_RETRY_AFTER_SECONDS,
    });
  }

  return {
    show_round: {
      annotations: { title: 'Show the creator a live round card', ...READS },
      description:
        "Render a live status card for this round in the creator's chat: phase, latest progress note and " +
        'screenshot, gate verdict, deliveries left. It refreshes itself and stops when the round settles, so ' +
        'the creator can watch without you polling. ' +
        'Call it ONCE per round, after start — a second call renders a second card. ' +
        'A preview_failed / red card is not finished: honour warnings.code=must_fix_gate, fix, and ' +
        'submit_sources again — show_round alone does not re-run the gate. ' +
        'Only clients that render MCP Apps views see anything; elsewhere it is a plain status read. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: { sessionKey: SESSION_KEY_PROP },
        required: [],
      },
      // Same shape as get_round_status; the view polls that door itself.
      outputSchema: ROUND_STATUS_OUTPUT_SCHEMA,
      handler: async (args, ctx) => {
        const status = await roundStatusHandler(args, ctx);
        // Echoes the key so the view holds it from its first frame.
        if (status.isError || typeof args.sessionKey !== 'string') return status;
        const data = { ...(status.structuredContent as Record<string, unknown>), sessionKey: args.sessionKey };
        return toolOk(data);
      },
    },

    show_media: {
      annotations: { title: "Show the creator the gate's screenshots", ...READS },
      description:
        "Render the gate's screenshots for a delivery in the creator's chat, at a size they can actually look at, " +
        'with the gameplay recording and a link to play. ' +
        'Use this when the creator asks to see the game — get_gate_media lets *you* look at the frames, but its ' +
        'attachments are input to you rather than something the creator sees. ' +
        'Defaults to the latest delivery. Only clients that render MCP Apps views show anything. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          deliveryId: { type: 'string', description: "Delivery to show; default is the round's latest." },
        },
        required: [],
      },
      outputSchema: ROUND_STATUS_OUTPUT_SCHEMA,
      handler: async (args, ctx) => {
        const status = await roundStatusHandler(args, ctx);
        if (status.isError) return status;
        const auth = await resolveAuth(ctx, args, { allowTerminalReceipt: true });
        const record = 'record' in auth ? auth.record : null;
        // Delivery to show frames for; may belong to an earlier round.
        const wanted =
          (typeof args.deliveryId === 'string' && args.deliveryId.trim()) ||
          record?.previewVersion ||
          record?.deliveredVersion ||
          null;
        return toolOk({
          ...(status.structuredContent as Record<string, unknown>),
          mediaDeliveryId: wanted,
          ...(typeof args.sessionKey === 'string' ? { sessionKey: args.sessionKey } : {}),
        });
      },
    },

    // App-only (SEP-1865): the view polls this, not the model.
    get_round_status: {
      annotations: { title: 'Round status for the round view', ...READS },
      outputSchema: ROUND_STATUS_OUTPUT_SCHEMA,
      description:
        'Round state for the gamedev.pl round view: phase, latest progress note, latest screenshot and the current ' +
        'gate verdict in one read. Intended for the view, which polls it on retryAfterSeconds — pass sinceShotId to ' +
        'skip re-sending screenshot bytes you already hold. Read-only, and deliberately does not count as agent ' +
        'presence: a creator watching does not keep a quiet round looking alive.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          locale: {
            type: 'string',
            description:
              "The reader's language (BCP-47), so a localized progress note is shown only to who can read it.",
          },
          sinceShotId: {
            type: 'string',
            description: 'Screenshot id you already have; bytes are omitted when the latest shot still matches it.',
          },
        },
        required: [],
      },
      handler: roundStatusHandler,
    },
  };
}
