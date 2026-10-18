// reference_unseen: a creator image newer than any the agent downloaded.
import type { Store } from '../platform/store.js';
import type { NudgeWarning } from './mcp-session-nudges.js';
import { channelControlFields, pendingMessagesFromChannel, type ChannelControlBody } from './mcp-tool-support.js';

// Writes are where building blind costs the round.
export const REFERENCE_WRITE_TOOLS = new Set([
  'stage_source_file',
  'patch_source_file',
  'stage_upload_url',
  'submit_sources',
]);

export function referenceUnseen(newestAt: string | undefined, seenAt: string | undefined): boolean {
  return Boolean(newestAt && !(seenAt && seenAt >= newestAt));
}

export const REFERENCE_UNSEEN_WARNING: NudgeWarning = {
  code: 'reference_unseen',
  message:
    'The creator attached a reference image you have not downloaded; it may come from an earlier message in this game. ' +
    'It is part of the request: get_reference_images returns its URL (get_brief lists only ids); with a shell, curl it ' +
    'and read the file before building on. Without a shell, say in end.summary that you did not see it.',
};

// Refused requests drop their images, so every stored reference was accepted.
export function createReferenceLookup(store: Pick<Store, 'getSubmission' | 'listBuildShots'>) {
  return async (jobId: number): Promise<boolean> => {
    try {
      const [record, [newest]] = await Promise.all([
        store.getSubmission(jobId),
        store.listBuildShots(jobId, { label: 'creator-reference', limit: 1 }),
      ]);
      return Boolean(record) && referenceUnseen(newest?.createdAt, record?.referenceSeenAt);
    } catch {
      // A soft warning; a failed read must not fail the write.
      return false;
    }
  };
}

export const REFERENCE_HOLD_RETRY =
  'Not delivered: a creator reference image is still undownloaded. get_reference_images returns its URL; curl it ' +
  'and read the file, then submit again. A second submit_sources this round is delivered either way.';

// Holds one delivery per round while a reference is unseen; never two.
export function createReferenceHold(
  lookup: (jobId: number) => Promise<boolean>,
  store: Pick<Store, 'claimReferenceHold'>,
) {
  return async (jobId: number, roundGeneration: number): Promise<boolean> => {
    if (!(await lookup(jobId))) return false;
    // Durable and atomic: a failed claim delivers rather than blocks.
    return store.claimReferenceHold(jobId, roundGeneration).catch(() => false);
  };
}

// A held submit's reply, carrying the live round state.
export async function referenceHoldReply(
  mode: 'preview' | 'publish',
  live: () => Promise<{ statusCode: number; json: () => unknown }>,
): Promise<Record<string, unknown>> {
  const res = await live();
  const body = (res.statusCode === 200 ? res.json() : {}) as ChannelControlBody & {
    pending?: Array<{ id: string; text: string; createdAt: string }>;
  };
  return {
    ok: false,
    mode,
    rejected: 'reference_unseen',
    retry: REFERENCE_HOLD_RETRY,
    deliveryId: null,
    delivery: null,
    gateStarted: false,
    deliveriesRemaining: null,
    ...channelControlFields(body),
    pendingMessages: pendingMessagesFromChannel(body),
  };
}
