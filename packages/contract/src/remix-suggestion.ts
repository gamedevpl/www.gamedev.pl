export const REMIX_SUGGESTION_DIRECTIONS = ['more', 'less', 'on', 'off'] as const;
export type RemixSuggestionDirection = (typeof REMIX_SUGGESTION_DIRECTIONS)[number];

// The generic starters offered when a rebuild is available.
export const REMIX_SUGGESTION_STARTERS = ['faster', 'look', 'harder'] as const;
export type RemixSuggestionStarterId = (typeof REMIX_SUGGESTION_STARTERS)[number];

export type RemixSuggestion =
  | { kind: 'param'; key: string; direction: RemixSuggestionDirection }
  | { kind: 'starter'; id: RemixSuggestionStarterId };
