import { describe, expect, it } from 'vitest';
import { MAX_WORLD_ENTRY_BYTES, MAX_WORLD_FIELDS, MAX_WORLD_KEY_LENGTH } from './world-limits.js';

describe('world limits', () => {
  it('pins the budgets the API validates and the web pre-checks', () => {
    expect(MAX_WORLD_FIELDS).toBe(12);
    expect(MAX_WORLD_KEY_LENGTH).toBe(64);
    expect(MAX_WORLD_ENTRY_BYTES).toBe(4 * 1024);
  });
});
