import { z } from 'zod';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import { BOT_UID_PREFIX, type Store, type SubmissionRecord } from '../platform/store.js';

export type EditorialPublishDecision = 'blocked' | 'pending' | 'clear';

export const MAX_OVERRIDE_REASON = 500;

const OverrideReasonSchema = z.string().trim().max(MAX_OVERRIDE_REASON);

export interface EditorialPublishCounts {
  decision: EditorialPublishDecision;
  reviewers: number;
  keep: number;
  cut: number;
  skip: number;
  weakOrBad: Record<string, number>;
}

export type EditorialPublishResult =
  | { status: 400; body: { error: 'reason_required' | 'reason_too_long' } }
  | {
      status: 409;
      body: {
        error: 'editorial_cut' | 'editorial_pending';
        reviewers: number;
        keep: number;
        cut: number;
        skip: number;
        weakOrBad: Record<string, number>;
      };
    }
  | { reason: string };

export function readPublishOverride(
  body: unknown,
): { override: boolean; reason: string } | { error: 'reason_required' | 'reason_too_long' } {
  const raw = body && typeof body === 'object' ? (body as { override?: unknown; overrideReason?: unknown }) : {};
  const override = raw.override === true;
  if (!override) return { override: false, reason: '' };
  if (typeof raw.overrideReason !== 'string') return { error: 'reason_required' };
  const parsed = OverrideReasonSchema.safeParse(raw.overrideReason);
  if (!parsed.success) {
    return parsed.error.issues.some((issue) => issue.code === 'too_big')
      ? { error: 'reason_too_long' }
      : { error: 'reason_required' };
  }
  const reason = sanitizeCreatorText(parsed.data, { singleLine: true });
  if (!reason) return { error: 'reason_required' };
  return { override: true, reason };
}

export async function resolveEditorialPublish(opts: {
  editorialClearance?: (slug: string) => Promise<EditorialPublishCounts>;
  ownerUid: string;
  slug: string;
  body: unknown;
}): Promise<EditorialPublishResult> {
  const parsed = readPublishOverride(opts.body);
  if ('error' in parsed) return { status: 400, body: { error: parsed.error } };
  // Policy at composition root, not a route invariant.
  if (!opts.editorialClearance || opts.ownerUid.startsWith(BOT_UID_PREFIX)) {
    return { reason: 'approved' };
  }
  const clearance = await opts.editorialClearance(opts.slug);
  if (clearance.decision !== 'clear' && !parsed.override) {
    return {
      status: 409,
      body: {
        error: clearance.decision === 'blocked' ? 'editorial_cut' : 'editorial_pending',
        reviewers: clearance.reviewers,
        keep: clearance.keep,
        cut: clearance.cut,
        skip: clearance.skip,
        weakOrBad: clearance.weakOrBad,
      },
    };
  }
  if (clearance.decision !== 'clear') {
    const which = clearance.decision === 'blocked' ? 'editorial_cut' : 'editorial_pending';
    return { reason: `override:${which}:${parsed.reason}` };
  }
  return { reason: 'approved' };
}

// Preview-only rounds advance previewVersion alone; a delivery syncs both.
export function previewMatchesDelivery(record: SubmissionRecord, version: string): boolean {
  if (record.deliveredVersion !== version) return false;
  return !record.previewVersion || record.previewVersion === version;
}

// Supersede earlier rounds for this slug on publish.
export async function supersedeOtherRounds(store: Store, slug: string, jobId: number, at: string): Promise<void> {
  for (const other of await store.listActiveSubmissions()) {
    if (other.slug !== slug || other.jobId === jobId) continue;
    await store.recordJobTransition(other.jobId, {
      to: 'abandoned',
      at,
      by: 'system',
      reason: 'superseded_by_publish',
    });
    await store.setSubmissionAbandoned(other.jobId, at);
    await store.setSubmissionLastStatus(other.jobId, 'abandoned');
  }
}
