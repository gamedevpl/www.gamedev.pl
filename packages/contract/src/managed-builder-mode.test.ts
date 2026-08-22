import { describe, expect, it } from 'vitest';
import { MANAGED_BUILDER_MODES } from './managed-builder-mode.js';

describe('MANAGED_BUILDER_MODES', () => {
  it('lists the managed builder switch positions', () => {
    expect(MANAGED_BUILDER_MODES).toEqual(['auto', 'off', 'coming_soon']);
  });
});
