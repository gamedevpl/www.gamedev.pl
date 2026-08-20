// The steps a game build moves through, rendered from local copy.
export const BUILD_STEPS = [
  'planning',
  'art',
  'mechanics',
  'audio',
  'balancing',
  'fixing',
  'testing',
  'polishing',
] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];

// What kind of moment a build channel event is.
export const BUILD_EVENT_KINDS = ['step', 'milestone', 'asking', 'blocked', 'done'] as const;
export type BuildEventKind = (typeof BUILD_EVENT_KINDS)[number];
