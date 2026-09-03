import { describe, expect, it } from 'vitest';
import { closedBetaWall, describeError, pipeNeedsFlag, quotaExhausted } from './errors.js';
import { EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';

describe('error UX', () => {
  it('names a next action for closed-beta, quota, and pipe', () => {
    expect(closedBetaWall(3).message).toContain('#3');
    expect(quotaExhausted().exitCode).toBe(EXIT_REFUSED);
    expect(pipeNeedsFlag('--agent').exitCode).toBe(EXIT_INPUT);
    expect(describeError(pipeNeedsFlag('--yes')).next).toBe('--yes');
  });
});
