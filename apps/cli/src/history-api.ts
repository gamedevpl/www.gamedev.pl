import type { HistoryVersion, VersionHistoryPage, VersionHistoryTree } from '@gamedevpl/contract';
import type { ApiClient } from './api.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';

export function historySlug(slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug)) throw new CliError('invalid game slug', EXIT_INPUT);
  return slug;
}

export function historyVersion(version: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(version)) throw new CliError('invalid version', EXIT_INPUT);
  return version;
}

async function historyRequest<T>(api: ApiClient, path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api.request<T>('GET', path);
    } catch (error) {
      if (!(error instanceof CliError) || error.httpStatus !== 429 || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, error.retryAfterMs ?? 60_000));
    }
  }
}

export async function readHistory(api: ApiClient, slug: string, limit = Infinity): Promise<HistoryVersion[]> {
  historySlug(slug);
  const versions: HistoryVersion[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: String(Math.min(100, limit - versions.length)) });
    if (cursor) query.set('cursor', cursor);
    const page = await historyRequest<VersionHistoryPage>(api, `/api/me/studio/games/${slug}/versions?${query}`);
    if (!Array.isArray(page.versions) || typeof page.hasMore !== 'boolean')
      throw new CliError('server does not support paginated history yet; update the platform API', EXIT_REFUSED);
    versions.push(...page.versions);
    cursor = page.hasMore ? page.nextCursor : null;
    if (page.hasMore && (!cursor || seen.has(cursor))) throw new CliError('invalid history pagination', EXIT_REFUSED);
    if (cursor) seen.add(cursor);
  } while (cursor && versions.length < limit);
  return versions.slice(0, limit);
}

export async function readHistoryTree(
  api: ApiClient,
  slug: string,
  version: string,
  path?: string,
): Promise<VersionHistoryTree> {
  const query = path ? `?${new URLSearchParams({ path })}` : '';
  const tree = await historyRequest<VersionHistoryTree>(
    api,
    `/api/me/studio/games/${historySlug(slug)}/versions/${historyVersion(version)}/tree${query}`,
  );
  if (!tree.metadata || tree.metadata.version !== version || !Array.isArray(tree.files))
    throw new CliError('server does not support version metadata yet; update the platform API', EXIT_REFUSED);
  return tree;
}
