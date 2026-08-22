import { describe, expect, it } from 'vitest';
import { AVATAR_MODES } from './avatar-mode.js';

describe('AVATAR_MODES', () => {
  it('lists the two avatar sources', () => {
    expect(AVATAR_MODES).toEqual(['google', 'letter']);
  });
});
