import { describe, expect, it } from 'vitest';
import { AUTONOMY_MODES } from './autonomy-mode.js';

describe('AUTONOMY_MODES', () => {
  it('lists the four autonomy modes', () => {
    expect(AUTONOMY_MODES).toEqual(['digest-only', 'suggest', 'auto-fix-defects', 'auto-tune']);
  });
});
