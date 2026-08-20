import { describe, expect, it } from 'vitest';
import { BUILD_EVENT_KINDS, BUILD_STEPS } from './build-event.js';

describe('BUILD_STEPS', () => {
  it('lists the eight steps the API and web both derive', () => {
    expect(BUILD_STEPS).toEqual([
      'planning',
      'art',
      'mechanics',
      'audio',
      'balancing',
      'fixing',
      'testing',
      'polishing',
    ]);
  });
});

describe('BUILD_EVENT_KINDS', () => {
  it('lists the five kinds the API and web both derive', () => {
    expect(BUILD_EVENT_KINDS).toEqual(['step', 'milestone', 'asking', 'blocked', 'done']);
  });
});
