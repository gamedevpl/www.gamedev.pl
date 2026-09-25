import { describe, expect, it } from 'vitest';
import { editorialOverrideCopy, formatEditorialCounts, publishRefusalCopy } from './adminJobConfirm.js';

const counts = {
  reviewers: 2,
  keep: 0,
  cut: 2,
  skip: 0,
  weakOrBad: { gameplay: 1, fun: 0, graphics: 0, sound: 0, controls: 0 },
};

describe('publishRefusalCopy', () => {
  it('explains editorial refusals with the reviewer tally, not the raw code', () => {
    expect(publishRefusalCopy('editorial_cut', counts)).toContain('reviewers cut this game');
    expect(publishRefusalCopy('editorial_cut', counts)).toContain('2 reviewers');
    expect(publishRefusalCopy('editorial_pending', { ...counts, reviewers: 0, cut: 0 })).toContain(
      'no reviewer has cleared this game yet',
    );
    expect(publishRefusalCopy('reason_too_long')).toContain('too long');
  });

  it('names a superseded delivery instead of falling back to unknown', () => {
    expect(publishRefusalCopy('preview_superseded_delivery')).toContain('newer preview');
  });
});

describe('editorialOverrideCopy', () => {
  it('puts the counts in front of an override', () => {
    const cut = editorialOverrideCopy('editorial_cut', counts);
    expect(cut.title).toMatch(/cut consensus/i);
    expect(cut.body).toContain(formatEditorialCounts(counts));
    expect(cut.danger).toBe(true);
    expect(cut.confirmLabel).toBe('Override and publish');
  });
});
