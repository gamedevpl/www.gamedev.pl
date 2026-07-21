import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import pl from './locales/pl.json';

/** Recursively collects dotted key paths, e.g. "home.title". */
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    keyPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

// A missing translation silently falls back to the key name (or another
// language) in the UI — this test is the guard against that going unnoticed.
describe('locale resources', () => {
  it('pl has exactly the same keys as en', () => {
    expect(keyPaths(pl).sort()).toEqual(keyPaths(en).sort());
  });

  it('has no empty translation values', () => {
    for (const [lang, resource] of [
      ['en', en],
      ['pl', pl],
    ] as const) {
      for (const path of keyPaths(resource)) {
        const value = path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], resource);
        expect(typeof value === 'string' && value.trim().length > 0, `${lang}.${path} is empty`).toBe(true);
      }
    }
  });
});
