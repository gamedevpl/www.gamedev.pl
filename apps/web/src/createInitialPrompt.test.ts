import { describe, expect, it } from 'vitest';
import { resolveCreateInitialPrompt } from './createInitialPrompt.js';

describe('resolveCreateInitialPrompt', () => {
  it('prefers the fresh party seed over a stale retained Studio retry', () => {
    expect(resolveCreateInitialPrompt('a party game about cats', 'an old studio concept')).toBe(
      'a party game about cats',
    );
  });

  it('falls back to the Studio retry when there is no party seed', () => {
    expect(resolveCreateInitialPrompt(null, 'an old studio concept')).toBe('an old studio concept');
  });

  it('is blank when neither is set', () => {
    expect(resolveCreateInitialPrompt(null, null)).toBe('');
  });
});
