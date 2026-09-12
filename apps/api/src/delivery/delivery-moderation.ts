import { rejectionFor, type ContentChecker } from '../platform/moderation.js';
import { logModerationRejection, type ModerationLogger } from '../platform/moderation-metrics.js';
import type { RejectCategory } from '../platform/moderation-terms.js';
import { deliveredProseFields } from './delivered-prose.js';

export interface ProseRefusal {
  rejected: 'content_rejected' | 'moderation_unavailable';
  category: RejectCategory;
}

// A self-build can ignore the moderated spec, so read the artifact.
export async function refuseDeliveredProse(input: {
  contentChecker?: ContentChecker | null;
  files: readonly { path: string; content: string }[];
  uid: string;
  log?: ModerationLogger | null;
}): Promise<ProseRefusal | null> {
  if (!input.contentChecker) return null;
  const fields = deliveredProseFields(input.files);
  if (!fields.length) return null;

  const verdict = await input.contentChecker.checkFields(fields);
  if (!verdict.allowed) {
    const rejection = rejectionFor(verdict);
    if (input.log) {
      logModerationRejection(input.log, {
        surface: 'delivery',
        uid: input.uid,
        category: rejection.category,
        ...(verdict.unavailable ? { unavailable: true } : {}),
      });
    }
    return {
      rejected: rejection.error === 'moderation_unavailable' ? 'moderation_unavailable' : 'content_rejected',
      category: rejection.category,
    };
  }
  return null;
}
