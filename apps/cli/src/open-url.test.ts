import { describe, expect, it } from 'vitest';
import { openUrl } from './open-url.js';

describe('openUrl', () => {
  it('refuses non-http URLs', async () => {
    expect(await openUrl('javascript:alert(1)')).toBe(false);
    expect(await openUrl('not a url')).toBe(false);
  });
});
