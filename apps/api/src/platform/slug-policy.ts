export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'contact',
  'draft',
  'health',
  'join',
  'new',
  'play',
  'privacy',
  'studio',
  'status',
  'terms',
]);

export const isCanonicalSlug = (slug: string): boolean =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !RESERVED_SLUGS.has(slug);
