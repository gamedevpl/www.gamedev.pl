// Why the arcade put a particular game in front of someone.
export const RECOMMEND_REASONS = ['popular', 'for_you', 'because_you_played', 'continue'] as const;
export type RecommendReason = (typeof RECOMMEND_REASONS)[number];
