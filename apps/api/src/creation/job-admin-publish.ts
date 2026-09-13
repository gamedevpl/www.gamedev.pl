import { BOT_UID_PREFIX } from '../platform/store.js';

export type EditorialPublishDecision = 'blocked' | 'pending' | 'clear';

export interface EditorialPublishCounts {
  decision: EditorialPublishDecision;
  reviewers: number;
  keep: number;
  cut: number;
  skip: number;
  weakOrBad: Record<string, number>;
}

export type EditorialPublishResult =
  | { status: 400; body: { error: 'reason_required' } }
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
): { override: boolean; reason: string } | { error: 'reason_required' } {
  const raw = body && typeof body === 'object' ? (body as { override?: unknown; overrideReason?: unknown }) : {};
  const override = raw.override === true;
  const reason = typeof raw.overrideReason === 'string' ? raw.overrideReason.trim() : '';
  if (override && !reason) return { error: 'reason_required' };
  return { override, reason };
}

export async function resolveEditorialPublish(opts: {
  editorialClearance?: (slug: string) => Promise<EditorialPublishCounts>;
  ownerUid: string;
  slug: string;
  body: unknown;
}): Promise<EditorialPublishResult> {
  const parsed = readPublishOverride(opts.body);
  if ('error' in parsed) return { status: 400, body: { error: 'reason_required' } };
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
