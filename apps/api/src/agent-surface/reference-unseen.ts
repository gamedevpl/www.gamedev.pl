// reference_unseen: a creator image newer than any the agent downloaded.
import type { Store } from '../platform/store.js';
import { referenceShotIds } from './inbox-reference-images.js';
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
    'The creator attached a reference image you have not downloaded. It is part of the request: ' +
    'get_reference_images (or referenceImages on read_inbox) gives its URL; with a shell, curl it and read the ' +
    'file before building on. Without a shell, say in end.summary that you did not see it.',
};

// Recent creator messages; older images were the work of earlier rounds.
const MESSAGE_WINDOW = 20;
const REFERENCE_WINDOW = 24;

// Only images a queued creator message names; refused requests never count.
export function createReferenceLookup(store: Pick<Store, 'getSubmission' | 'listBuildShots' | 'listCreatorMessages'>) {
  return async (jobId: number): Promise<boolean> => {
    try {
      const [record, messages, shots] = await Promise.all([
        store.getSubmission(jobId),
        store.listCreatorMessages(jobId, { limit: MESSAGE_WINDOW, excludeProposals: true }),
        store.listBuildShots(jobId, { label: 'creator-reference', limit: REFERENCE_WINDOW }),
      ]);
      const named = new Set(referenceShotIds(messages));
      const newest = shots.find((shot) => named.has(shot.id));
      return Boolean(record) && referenceUnseen(newest?.createdAt, record?.referenceSeenAt);
    } catch {
      // A soft warning; a failed read must not fail the write.
      return false;
    }
  };
}
