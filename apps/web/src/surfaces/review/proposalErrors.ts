import type { ProposalApiError } from '../../proposalsApi.js';

export type ReviewAction = 'accept' | 'decline' | 'changes';

// Accept refusals the reviewer can act on, each with its own copy.
const ACCEPT_CODES = new Set([
  'round_in_progress',
  'quota_exhausted',
  'account_blocked',
  'managed_unavailable',
  'content_rejected',
  'moderation_unavailable',
  'not_published',
  'stale_owner',
  'no_source_job',
  'round_failed',
  'round_unlinked',
]);

// Refusals meaning the card is out of date, on any action.
const STALE_CODES = new Set(['superseded', 'not_reviewable', 'not_found']);

function codeOf(error: unknown): string | undefined {
  return (error as Partial<ProposalApiError> | null)?.code;
}

// The i18n key for a failed review action; generic when unrecognised.
export function reviewErrorKey(error: unknown, action: ReviewAction): string {
  const code = codeOf(error);
  if (!code) return 'propose.errors.generic';
  if (STALE_CODES.has(code)) return `reviews.errors.${code}`;
  if (action === 'accept' && ACCEPT_CODES.has(code)) {
    return `reviews.errors.${code === 'round_unlinked' ? 'round_failed' : code}`;
  }
  // On decline or changes, moderation judged the reviewer's own note.
  if (code === 'content_rejected') return 'reviews.errors.note_rejected';
  if (code === 'moderation_unavailable') return 'reviews.errors.moderation_unavailable';
  return 'propose.errors.generic';
}

// Whether the proposal moved under the reviewer, so the card should refetch.
export function isStaleRefusal(error: unknown): boolean {
  const code = codeOf(error);
  return code === 'superseded' || code === 'not_reviewable';
}
