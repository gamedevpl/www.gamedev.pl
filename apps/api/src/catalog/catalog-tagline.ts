import type { CatalogGameEntry } from './github-client.js';

type Tagline = NonNullable<CatalogGameEntry['tagline']>;

export function manifestTagline(raw: string | null): Tagline | undefined {
  if (!raw) return undefined;
  try {
    const manifest: unknown = JSON.parse(raw);
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return undefined;
    const value = (manifest as { description?: unknown }).description;
    if (typeof value === 'string') {
      const text = value.trim().replace(/\s+/g, ' ');
      return text ? { en: text, pl: text } : undefined;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const locales = value as { en?: unknown; pl?: unknown };
    const en = typeof locales.en === 'string' ? locales.en.trim().replace(/\s+/g, ' ') : '';
    const pl = typeof locales.pl === 'string' ? locales.pl.trim().replace(/\s+/g, ' ') : '';
    return en || pl ? { en: en || pl, pl: pl || en } : undefined;
  } catch {
    return undefined;
  }
}
