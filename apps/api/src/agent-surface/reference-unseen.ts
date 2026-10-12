// reference_unseen: a creator image newer than any the agent downloaded.
import type { SubmissionRecord } from '../platform/store.js';
import type { NudgeWarning } from './mcp-session-nudges.js';

// Writes are where building blind costs the round.
export const REFERENCE_WRITE_TOOLS = new Set([
  'stage_source_file',
  'patch_source_file',
  'stage_upload_url',
  'submit_sources',
]);

export function referenceUnseen(
  record: Pick<SubmissionRecord, 'referenceLatestAt' | 'referenceSeenAt'> | null,
): boolean {
  const latest = record?.referenceLatestAt;
  return Boolean(latest && !(record.referenceSeenAt && record.referenceSeenAt >= latest));
}

export const REFERENCE_UNSEEN_WARNING: NudgeWarning = {
  code: 'reference_unseen',
  message:
    'The creator attached a reference image you have not downloaded. It is part of the request: ' +
    'get_reference_images (or referenceImages on read_inbox) gives its URL; with a shell, curl it and read the ' +
    'file before building on. Without a shell, say in end.summary that you did not see it.',
};
