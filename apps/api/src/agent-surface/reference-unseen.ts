// reference_unseen: a creator image newer than any the agent downloaded.
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { NudgeWarning } from './mcp-session-nudges.js';
import { referenceShotIds } from './inbox-reference-images.js';

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

// Per shot; the frozen legacy time mark covers older downloads.
function referenceSeen(
  record: Pick<SubmissionRecord, 'referenceSeenAt'>,
  shot: { agentSeenAt?: string; createdAt: string },
): boolean {
  return Boolean(shot.agentSeenAt) || !referenceUnseen(shot.createdAt, record.referenceSeenAt);
}

export const REFERENCE_UNSEEN_WARNING: NudgeWarning = {
  code: 'reference_unseen',
  message:
    'A creator note you have not acknowledged names a reference image you have not downloaded. ' +
    'It is part of the request: get_reference_images returns its URL (get_brief lists only ids); with a shell, curl it ' +
    'and read the file before building on. Without a shell, say in end.summary that you did not see it.',
};

// Images pending notes name; before any delivery, the brief's newest too.
export function createReferenceLookup(
  store: Pick<Store, 'getSubmission' | 'listBuildShots' | 'listPendingCreatorMessages'>,
) {
  return async (jobId: number): Promise<boolean> => {
    try {
      const [record, pending, shots] = await Promise.all([
        store.getSubmission(jobId),
        // Unbounded: a named image may sit behind many notes or newer images.
        store.listPendingCreatorMessages(jobId, { limit: Infinity }),
        store.listBuildShots(jobId, { label: 'creator-reference', limit: Infinity }),
      ]);
      if (!record) return false;
      const named = new Set(referenceShotIds(pending));
      const firstBuild = !record.deliveredVersion && !record.previewVersion;
      const relevant = shots.filter((shot, index) => named.has(shot.id) || (firstBuild && index === 0));
      return relevant.some((shot) => !referenceSeen(record, shot));
    } catch {
      // A soft warning; a failed read must not fail the write.
      return false;
    }
  };
}
