import type { Store, SubmissionRecord } from '../platform/store.js';
import { playUrlFor } from './mcp-round-card-tools.js';
import {
  toolOk,
  toolErr,
  SESSION_KEY_PROP,
  type ToolContext,
  type ToolHandler,
  type ToolResult,
} from './mcp-tool-support.js';

const WRITES = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

interface AuthedRoundJob {
  jobId: number;
  record: SubmissionRecord;
}

export interface ShareDraftToolsDeps {
  resolveAuth: (
    ctx: ToolContext,
    args: Record<string, unknown>,
    options?: { allowTerminalReceipt?: boolean },
  ) => Promise<AuthedRoundJob | ToolResult>;
  store: Store | undefined;
  // Injected from submissions.ts — agent-surface avoids importing delivery.
  refuseShare: ((record: SubmissionRecord) => Promise<{ error: string; message: string } | null>) | undefined;
  now: () => number;
}

export interface ShareDraftToolEntry {
  annotations: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

const SHARE_DRAFT_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    shared: { type: 'boolean' },
    slug: { type: 'string' },
    playUrl: { type: ['string', 'null'] },
  },
  required: ['shared', 'slug'],
};

// Lets an agent do what Studio's share toggle does, no login.
export function createShareDraftTools(deps: ShareDraftToolsDeps): Record<string, ShareDraftToolEntry> {
  const { resolveAuth, store, refuseShare, now } = deps;

  return {
    share_draft: {
      annotations: { title: 'Share or unshare this draft', ...WRITES },
      outputSchema: SHARE_DRAFT_OUTPUT_SCHEMA,
      description:
        "Toggle this unpublished draft's public link. Unshared, /play/<slug> is only playable by the signed-in " +
        'owner — anyone else, including the creator on a device they are not logged into, hits a sign-in wall. ' +
        'Sharing (the default when shared is omitted) opens that link to anyone who has it, once the latest ' +
        'delivery has a green preview or publish gate; a red or pending gate refuses the share. Pass ' +
        'shared:false to take a previously shared link private again.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          shared: { type: 'boolean', description: 'true to share (default), false to make the draft private again.' },
        },
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('record' in auth)) return auth;
        if (!store || !refuseShare) return toolErr('the MCP build endpoint is not configured');

        const record = auth.record;
        const shared = args.shared !== false;

        if (shared) {
          if (!record.slug) {
            return toolErr('this game has no address yet — deliver a build before sharing it');
          }
          const refusal = await refuseShare(record);
          if (refusal) return toolErr(refusal.message, { reason: refusal.error });
        }

        await store.setDraftShared(auth.jobId, shared ? new Date(now()).toISOString() : null);
        return toolOk({ shared, slug: record.slug ?? null, playUrl: playUrlFor(record.slug) });
      },
    },
  };
}
