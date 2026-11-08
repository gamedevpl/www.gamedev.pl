import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { creatorLocale } from './creator-locale.js';

describe('creatorLocale', () => {
  it("prefers the creator's account language over the round's stored one", async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:pl', locale: 'pl-PL' });
    await store.upsertUser({ uid: 'g:none' });
    expect(await creatorLocale(store, 'g:pl', 'en')).toBe('pl');
    expect(await creatorLocale(store, 'g:none', 'pl')).toBe('pl');
    expect(await creatorLocale(store, 'g:none', undefined)).toBe('en');
    expect(await creatorLocale(store, 'g:missing', 'de')).toBe('en');
  });
});
