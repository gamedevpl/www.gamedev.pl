import { describe, expect, it } from 'vitest';
import { BUILDERS, isBuilderKind } from './builder-kind.js';

describe('BUILDERS', () => {
  it('lists who can build a round', () => {
    expect(BUILDERS).toEqual(['platform', 'self']);
  });
});

describe('isBuilderKind', () => {
  it('accepts platform and self', () => {
    expect(isBuilderKind('platform')).toBe(true);
    expect(isBuilderKind('self')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isBuilderKind('other')).toBe(false);
    expect(isBuilderKind(undefined)).toBe(false);
  });
});
