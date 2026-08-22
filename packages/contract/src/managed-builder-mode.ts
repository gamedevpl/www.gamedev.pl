// Operator switch for offering the managed platform builder.
export const MANAGED_BUILDER_MODES = ['auto', 'off', 'coming_soon'] as const;
export type ManagedBuilderMode = (typeof MANAGED_BUILDER_MODES)[number];
