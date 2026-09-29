import { describe, expect, it } from 'vitest';
import { IMAGE_EXPORT_STEPS } from './index.js';

describe('image export vocab', () => {
  it('lists steps request first, and is exported from the package', () => {
    expect(IMAGE_EXPORT_STEPS).toEqual(['requested', 'saved', 'dismissed', 'failed', 'rejected']);
  });
});
