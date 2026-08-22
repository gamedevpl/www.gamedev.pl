import { describe, expect, it } from 'vitest';
import { PREFLIGHT_KINDS } from './preflight-kind.js';

describe('PREFLIGHT_KINDS', () => {
  it('lists the three preflight checks', () => {
    expect(PREFLIGHT_KINDS).toEqual(['audio', 'symbols', 'typecheck']);
  });
});
