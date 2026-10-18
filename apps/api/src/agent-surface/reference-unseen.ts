// reference_unseen: a creator image newer than any the agent downloaded.
import type { Store } from '../platform/store.js';
import type { NudgeWarning } from './mcp-session-nudges.js';

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

// What submit_sources answers when it holds a delivery.
export function referenceHoldReply(mode: unknown): Record<string, unknown> {
  return {
    ok: false,
    mode: mode === 'publish' ? 'publish' : 'preview',
    rejected: 'reference_unseen',
    retry: REFERENCE_HOLD_RETRY,
    deliveryId: null,
    delivery: null,
    gateStarted: false,
    deliveriesRemaining: null,
    stop: false,
    pendingMessages: [],
  };
}
