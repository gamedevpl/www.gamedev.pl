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

/**
 * i18next's JSON v4 plural suffixes. A plural key is stored once per CLDR category
 * ("games.count_one", "games.count_other"), and which categories exist is a property
 * of the *language*, not of the string: English has one/other, Polish has
 * one/few/many/other. So the two files legitimately hold different key sets here, and
 * comparing raw paths would demand pl carry an English grammar. Both tests below
 * compare the base key instead, and the category check is what replaces the lost
 * strictness — per language, against its own rules.
 */
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLURAL_PATTERN = new RegExp(`_(${PLURAL_SUFFIXES.join('|')})$`);

const basePath = (path: string): string => path.replace(PLURAL_PATTERN, '');

/** Base path -> the CLDR categories this resource actually provides for it. */
function pluralGroups(resource: unknown): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();
  for (const path of keyPaths(resource)) {
    const match = PLURAL_PATTERN.exec(path);
    if (!match) continue;
    const base = basePath(path);
    const categories = groups.get(base) ?? new Set<string>();
    categories.add(match[1] as string);
    groups.set(base, categories);
  }
  return groups;
}

// A missing translation silently falls back to the key name (or another
// language) in the UI — this test is the guard against that going unnoticed.
describe('locale resources', () => {
  it('pl has exactly the same keys as en', () => {
    expect([...new Set(keyPaths(pl).map(basePath))].sort()).toEqual([...new Set(keyPaths(en).map(basePath))].sort());
  });

  // The half of the parity guarantee the base-key comparison above gives up. Without
  // this, dropping "count_few" from pl reads as a complete translation and shows
  // English's grammar to a Polish creator for every count of 2, 3 or 4.
  it('every plural key has all the categories its language requires', () => {
    const groups = { en: pluralGroups(en), pl: pluralGroups(pl) };
    const bases = [...new Set([...groups.en.keys(), ...groups.pl.keys()])].sort();
    expect(bases.length, 'expected at least one plural key').toBeGreaterThan(0);

    for (const base of bases) {
      for (const [lang, byBase] of Object.entries(groups) as Array<['en' | 'pl', Map<string, Set<string>>]>) {
        const required = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
        const actual = [...(byBase.get(base) ?? new Set<string>())].sort();
        expect(actual, `${lang}.${base}`).toEqual([...required].sort());
      }
    }
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
