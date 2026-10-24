import type { CatalogEntry } from '@gamedevpl/contract';

type Tagline = NonNullable<CatalogEntry['tagline']>;

export function parseCatalogTagline(frontmatter: Record<string, string>): Tagline | null {
  const en = frontmatter.tagline_en?.trim();
  const pl = frontmatter.tagline_pl?.trim();
  return en || pl ? { ...(en ? { en } : {}), ...(pl ? { pl } : {}) } : null;
}

export function mergeCatalogTaglines(authored: CatalogEntry['tagline'], generated: Tagline): Tagline {
  return {
    ...generated,
    ...(authored?.en?.trim() ? { en: authored.en.trim() } : {}),
    ...(authored?.pl?.trim() ? { pl: authored.pl.trim() } : {}),
  };
}
