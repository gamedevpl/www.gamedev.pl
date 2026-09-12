// What a reviewer reports, distinct from the keep/cut verdict.
export const MODERATION_FLAG_REASONS = ['sexual', 'hate', 'violence', 'targets_person', 'infringing', 'other'] as const;
export type ModerationFlagReason = (typeof MODERATION_FLAG_REASONS)[number];

export const MODERATION_FLAG_STATUSES = ['open', 'resolved'] as const;
export type ModerationFlagStatus = (typeof MODERATION_FLAG_STATUSES)[number];

// What the operator did; recorded whether or not anything was pulled.
export const MODERATION_FLAG_ACTIONS = ['taken_down', 'dismissed'] as const;
export type ModerationFlagAction = (typeof MODERATION_FLAG_ACTIONS)[number];

export function isModerationFlagReason(value: unknown): value is ModerationFlagReason {
  return typeof value === 'string' && (MODERATION_FLAG_REASONS as readonly string[]).includes(value);
}
