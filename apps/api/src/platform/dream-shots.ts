// Reserved captions for shots the dream job stores under a build.

// The real gate frame a proposal was drawn from.
export const DREAM_SOURCE_SHOT_LABEL = 'Dream source';

// An AI-edited concept frame; the studio must always say so.
export const DREAM_FRAME_SHOT_LABEL = 'AI concept';

// Both reserved captions, for store reads that must skip proposal shots.
export const DREAM_SHOT_LABELS: readonly string[] = [DREAM_SOURCE_SHOT_LABEL, DREAM_FRAME_SHOT_LABEL];

// True for shots that belong to a proposal, not the media strip.
export function isDreamShotLabel(label: string | undefined): boolean {
  return DREAM_SHOT_LABELS.includes(label ?? '');
}
