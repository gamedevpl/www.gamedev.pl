import { describe, expect, it } from 'vitest';
import {
  ASSESSMENT_CHECKLIST_MARKS,
  ASSESSMENT_INPUT_METHODS,
  ASSESSMENT_NOTE_ORIGINS,
  ASSESSMENT_PLATFORMS,
  ASSESSMENT_RESOLUTION_STATUSES,
  ASSESSMENT_SOURCES,
  ASSESSMENT_VERDICTS,
  RE_REVIEW_REQUEST_STATUSES,
  REVIEW_SWEEP_SOURCES,
  REVIEW_SWEEP_STATUSES,
} from './review-vocab.js';

describe('review vocab', () => {
  it('lists assessment verdicts', () => {
    expect(ASSESSMENT_VERDICTS).toEqual(['keep', 'cut', 'skip']);
  });

  it('lists assessment sources', () => {
    expect(ASSESSMENT_SOURCES).toEqual(['catalog', 'creator']);
  });

  it('lists assessment note origins', () => {
    expect(ASSESSMENT_NOTE_ORIGINS).toEqual(['text', 'speech', 'none']);
  });

  it('lists assessment input methods', () => {
    expect(ASSESSMENT_INPUT_METHODS).toEqual(['touch', 'mouse', 'mixed']);
  });

  it('lists assessment platforms', () => {
    expect(ASSESSMENT_PLATFORMS).toEqual(['ios', 'android', 'mac', 'windows', 'linux', 'other']);
  });

  it('lists assessment checklist marks', () => {
    expect(ASSESSMENT_CHECKLIST_MARKS).toEqual(['ok', 'weak', 'bad']);
  });

  it('lists assessment resolution statuses', () => {
    expect(ASSESSMENT_RESOLUTION_STATUSES).toEqual(['addressed', 'wont_fix', 'deferred']);
  });

  it('lists review sweep statuses', () => {
    expect(REVIEW_SWEEP_STATUSES).toEqual(['active', 'paused', 'completed', 'cancelled']);
  });

  it('lists review sweep sources', () => {
    expect(REVIEW_SWEEP_SOURCES).toEqual(['catalog', 'creator', 'all']);
  });

  it('lists re-review request statuses', () => {
    expect(RE_REVIEW_REQUEST_STATUSES).toEqual(['open', 'resolved', 'cancelled']);
  });
});
