// reference_unseen: a creator image newer than any the agent downloaded.
import { DREAM_SHOT_LABELS } from '../platform/dream-shots.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
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

const MAX_DERIVED = 1000;
// Short-lived, so a later image whose mark failed is still found.
const DERIVED_TTL_MS = 60_000;

// Images stored before the marker existed: derive it from the shots.
export function createReferenceLookup(
  store: Pick<Store, 'getSubmission' | 'listBuildShots'>,
  now: () => number = Date.now,
) {
  const derived = new Map<number, { latest: string | null; at: number }>();
  return async (jobId: number): Promise<boolean> => {
    try {
      const record = await store.getSubmission(jobId);
      if (!record) return false;
      if (record.referenceLatestAt) return referenceUnseen(record);
      const cached = derived.get(jobId);
      if (!cached || now() - cached.at >= DERIVED_TTL_MS) {
        if (derived.size >= MAX_DERIVED) derived.clear();
        const shots = await store.listBuildShots(jobId, { excludeLabels: DREAM_SHOT_LABELS });
        const stamps = shots.filter((shot) => shot.label === 'creator-reference').map((shot) => shot.createdAt);
        derived.set(jobId, { latest: stamps.sort().at(-1) ?? null, at: now() });
      }
      const latest = derived.get(jobId)?.latest ?? undefined;
      return referenceUnseen({ referenceLatestAt: latest, referenceSeenAt: record.referenceSeenAt });
    } catch {
      // A soft warning; a failed read must not fail the write.
      return false;
    }
  };
}
