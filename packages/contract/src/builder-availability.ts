// Why the platform builder cannot be picked right now.
export const BUILDER_UNAVAILABLE_REASONS = ['coming_soon', 'outage', 'global_limit', 'user_limit'] as const;
export type BuilderUnavailableReason = (typeof BUILDER_UNAVAILABLE_REASONS)[number];
