// Why a reviewer said no — API and web both derive this.
export const DECLINE_REASONS = [
  'not_the_direction',
  'duplicate',
  'quality',
  'off_topic',
  'unsafe',
  'infringing',
] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];
