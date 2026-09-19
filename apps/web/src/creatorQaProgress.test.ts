import { describe, expect, it } from 'vitest';
import { hasCreatorQaProgress } from './creatorQaProgress.js';

describe('hasCreatorQaProgress', () => {
  const base = {
    step: 0,
    maxStepReached: 0,
    title: 'My Game',
    baselineTitle: 'My Game',
    builder: 'platform' as const,
    baselineBuilder: 'platform' as const,
    selectedAnswers: {},
    customText: {},
  };

  it('returns false when no progress has been made', () => {
    expect(hasCreatorQaProgress(base)).toBe(false);
  });

  it('returns true if any non-zero step was ever reached', () => {
    // Creator moved to step 1 and then back to step 0
    expect(hasCreatorQaProgress({ ...base, maxStepReached: 1 })).toBe(true);
  });

  it('returns true when title is changed from baseline', () => {
    expect(hasCreatorQaProgress({ ...base, title: 'New Game Title' })).toBe(true);
  });

  it('returns true when builder is changed from baseline', () => {
    expect(hasCreatorQaProgress({ ...base, builder: 'self' })).toBe(true);
  });

  it('returns true when answers are selected', () => {
    expect(hasCreatorQaProgress({ ...base, selectedAnswers: { mechanics: ['Cards'] } })).toBe(true);
  });

  it('returns true when custom text is typed', () => {
    expect(hasCreatorQaProgress({ ...base, customText: { genre: 'Roguelike' } })).toBe(true);
  });
});
