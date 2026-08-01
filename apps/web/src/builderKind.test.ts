// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { defaultBuilderFor, isBuilderKind, loadLastBuilder, saveLastBuilder } from './builderKind.js';

describe('builderKind', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('recognises builder kinds', () => {
    expect(isBuilderKind('platform')).toBe(true);
    expect(isBuilderKind('self')).toBe(true);
    expect(isBuilderKind('other')).toBe(false);
  });

  it('persists the last builder per game token', () => {
    expect(loadLastBuilder('tok-a')).toBeNull();
    saveLastBuilder('tok-a', 'self');
    expect(loadLastBuilder('tok-a')).toBe('self');
    expect(loadLastBuilder('tok-b')).toBeNull();
    expect(defaultBuilderFor('tok-a')).toBe('self');
    expect(defaultBuilderFor('tok-b')).toBe('platform');
    expect(defaultBuilderFor(undefined)).toBe('platform');
  });
});
