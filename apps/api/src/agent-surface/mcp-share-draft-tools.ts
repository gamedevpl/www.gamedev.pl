import type { Store, SubmissionRecord } from '../platform/store.js';
import { canActOnSubmissionOrSlug } from '../platform/game-access-permissions.js';
import { playUrlFor } from './mcp-round-card-tools.js';
import {
  toolOk,
  toolErr,
  toolRefusal,
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
  actorUid: string;
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
    // Null when the round has no slug yet.
    slug: { type: ['string', 'null'] },
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
        "Set whether this unpublished draft's /play/<slug> link is open to anyone who has it. Unshared, only the " +
        'signed-in owner can play it; anyone else hits a sign-in wall. shared is required: true opens the link ' +
        '(not a publication: the draft is not listed or reviewed), false makes it private again. Sharing needs a ' +
        'green preview or publish gate on the latest delivery, and is refused for a slug that is already ' +
        'published, since /play/<slug> serves the published copy there.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          shared: { type: 'boolean', description: 'true opens the link to anyone who has it; false makes it private.' },
        },
        required: ['shared'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('record' in auth)) return auth;
        // Opening a link is never a default.
        if (typeof args.shared !== 'boolean') {
          return toolRefusal('shared is required: true opens the link, false makes it private', 'invalid_arguments');
        }
        if (!store || !refuseShare) return toolErr('the MCP build endpoint is not configured');

        const record = auth.record;
        if (!(await canActOnSubmissionOrSlug(store, record, auth.actorUid, 'publish'))) {
          return toolRefusal('only the creator can share this game', 'not_owner');
        }
        const shared = args.shared;

        if (shared) {
          if (!record.slug) {
            return toolErr('this game has no address yet — deliver a build before sharing it');
          }
          // Already published means /play/<slug> ignores any share grant.
          if (await store.getPublishedSubmissionBySlug(record.slug)) {
            return toolErr(
              'this slug is already published — a shared link here would not change what visitors see; ' +
                'publish this round to update the live game instead',
              { reason: 'already_published' },
            );
          }
          const refusal = await refuseShare(record);
          if (refusal) return toolErr(refusal.message, { reason: refusal.error });
        }

        await store.setDraftShared(
          auth.jobId,
          shared ? new Date(now()).toISOString() : null,
          auth.record.roundGeneration ?? 1,
        );
        return toolOk({ shared, slug: record.slug ?? null, playUrl: playUrlFor(record.slug) });
      },
    },
  };
}
