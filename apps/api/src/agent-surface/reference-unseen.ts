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
    'The creator attached a reference image you have not downloaded. It is part of the request: ' +
    'get_reference_images (or referenceImages on read_inbox) gives its URL; with a shell, curl it and read the ' +
    'file before building on. Without a shell, say in end.summary that you did not see it.',
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
