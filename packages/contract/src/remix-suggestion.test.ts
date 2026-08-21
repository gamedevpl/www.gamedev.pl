import { describe, expect, it } from 'vitest';
import { REMIX_SUGGESTION_DIRECTIONS, REMIX_SUGGESTION_STARTERS } from './remix-suggestion.js';

describe('remix suggestion vocab', () => {
  it('lists the param nudge directions', () => {
    expect(REMIX_SUGGESTION_DIRECTIONS).toEqual(['more', 'less', 'on', 'off']);
  });

  it('lists the generic starters', () => {
    expect(REMIX_SUGGESTION_STARTERS).toEqual(['faster', 'look', 'harder']);
  });
});
