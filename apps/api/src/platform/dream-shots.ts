// Reserved captions for shots the dream job stores under a build.

// The real gate frame a proposal was drawn from.
export const DREAM_SOURCE_SHOT_LABEL = 'Dream source';

// An AI-edited concept frame; the studio must always say so.
export const DREAM_FRAME_SHOT_LABEL = 'AI concept';

// True for shots that belong to a proposal, not the media strip.
export function isDreamShotLabel(label: string | undefined): boolean {
  return label === DREAM_SOURCE_SHOT_LABEL || label === DREAM_FRAME_SHOT_LABEL;
}
