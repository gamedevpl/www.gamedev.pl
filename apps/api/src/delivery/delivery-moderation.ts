import { createHash } from 'node:crypto';
import { rejectionFor, type ContentChecker } from '../platform/moderation.js';
import { logModerationRejection, type ModerationLogger } from '../platform/moderation-metrics.js';
import type { RejectCategory } from '../platform/moderation-terms.js';
import { deliveredProseFields } from './delivered-prose.js';

export interface ProseRefusal {
  rejected: 'content_rejected' | 'moderation_unavailable';
  category: RejectCategory;
}

export interface DeliveryModerationGate {
  refuse(input: {
    files: readonly { path: string; content: string }[];
    uid: string;
    log?: ModerationLogger | null;
  }): Promise<ProseRefusal | null>;
}

// Long enough to cover a session of code-only iteration.
export const PROSE_PASS_TTL_MS = 30 * 60_000;
const PROSE_PASS_MAX = 500;

function proseKey(fields: string[]): string {
  return createHash('sha256').update(fields.join('\n---\n')).digest('hex');
}

// A self-build can ignore the moderated spec, so read the artifact.
export function createDeliveryModerationGate(options: {
  contentChecker?: ContentChecker | null;
  now?: () => number;
  ttlMs?: number;
}): DeliveryModerationGate {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? PROSE_PASS_TTL_MS;
  // Passes only. A refusal is rare and already cheap to repeat.
  const passed = new Map<string, number>();

  return {
    async refuse(input) {
      if (!options.contentChecker) return null;
      const fields = deliveredProseFields(input.files);
      if (!fields.length) return null;

      const at = now();
      const key = proseKey(fields);
      const seenUntil = passed.get(key);
      if (seenUntil !== undefined && seenUntil > at) return null;
      passed.delete(key);

      const verdict = await options.contentChecker.checkFields(fields);
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

      if (passed.size >= PROSE_PASS_MAX) {
        const oldest = passed.keys().next().value;
        if (oldest !== undefined) passed.delete(oldest);
      }
      passed.set(key, at + ttlMs);
      return null;
    },
  };
}
