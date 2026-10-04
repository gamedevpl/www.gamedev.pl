import type { RemixMode } from '@gamedevpl/contract';
import { parseSpecFrontmatter } from '../platform/spec-frontmatter.js';
import type { Store } from '../platform/store.js';

// Fails closed: no lookup, or one that cannot answer, means absent.
export async function isRepoPublished(
  lookup: ((slug: string) => Promise<object | null>) | undefined,
  slug: string,
): Promise<boolean> {
  return (await repoCatalogEntry(lookup, slug)) !== null;
}

// The repo-lane catalog entry, or null; lookup failures read as absent.
export async function repoCatalogEntry(
  lookup: ((slug: string) => Promise<object | null>) | undefined,
  slug: string,
): Promise<object | null> {
  return lookup ? await lookup(slug).catch(() => null) : null;
}

// Repo lane reads its catalog entry; store lane reads SPEC.md.
export function declaresContentEditor(entry: object | null, specMd: string | undefined): boolean {
  if (entry) return (entry as { editor?: unknown }).editor === 'content';
  return specMd !== undefined && parseSpecFrontmatter(specMd).editor === 'content';
}

// Allowlist: only an explicit author/admin 'on' enables remix.
export async function remixModeFor(store: Store | undefined, slug: string): Promise<RemixMode> {
  if (!store) return 'off';
  const settings = await store.getRemixSettings(slug);
  return settings?.mode === 'on' ? 'on' : 'off';
}
