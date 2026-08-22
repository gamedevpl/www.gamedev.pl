import { describe, expect, it } from 'vitest';
import { DISMISS_REASONS } from './dismiss-reason.js';

describe('DISMISS_REASONS', () => {
  it('lists the five dismissal reasons', () => {
    expect(DISMISS_REASONS).toEqual(['intentional', 'not-a-problem', 'wont-fix', 'not-now', 'bad-evidence']);
  });
});
