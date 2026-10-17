import type { HistoryVersion, VersionHistoryPage, VersionHistoryTree } from '@gamedevpl/contract';
import type { ApiClient } from './api.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

export function historySlug(slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug)) throw new CliError('invalid game slug', EXIT_INPUT);
  return slug;
}

export function historyVersion(version: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(version)) throw new CliError('invalid version', EXIT_INPUT);
  return version;
}

async function historyRequest<T>(api: ApiClient, path: string, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api.request<T>('GET', path, undefined, signal);
    } catch (error) {
      if (!(error instanceof CliError) || error.httpStatus !== 429 || attempt >= 3) throw error;
      await delay(error.retryAfterMs ?? 60_000, signal);
    }
  }
}

export async function* historyRows(
  api: ApiClient,
  slug: string,
  pageSize = 100,
  signal?: AbortSignal,
): AsyncGenerator<HistoryVersion> {
  historySlug(slug);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw new CliError('invalid history page size', EXIT_INPUT);
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    signal?.throwIfAborted();
    const query = new URLSearchParams({ limit: String(pageSize) });
    if (cursor) query.set('cursor', cursor);
    const page = await historyRequest<VersionHistoryPage>(
      api,
      `/api/me/studio/games/${slug}/versions?${query}`,
      signal,
    );
    if (!Array.isArray(page.versions) || typeof page.hasMore !== 'boolean')
      throw new CliError('server does not support paginated history yet; update the platform API', EXIT_REFUSED);
    cursor = page.hasMore ? page.nextCursor : null;
    if (page.hasMore && (!page.versions.length || !cursor || seen.has(cursor)))
      throw new CliError('invalid history pagination', EXIT_REFUSED);
    if (cursor) seen.add(cursor);
    yield* page.versions;
  } while (cursor);
}

export async function readHistory(api: ApiClient, slug: string, limit = Infinity): Promise<HistoryVersion[]> {
  const versions: HistoryVersion[] = [];
  for await (const row of historyRows(api, slug, Math.min(100, limit))) {
    versions.push(row);
    if (versions.length >= limit) break;
  }
  return versions;
}

export async function readHistoryTree(
  api: ApiClient,
  slug: string,
  version: string,
  path?: string,
  signal?: AbortSignal,
): Promise<VersionHistoryTree> {
  const query = path ? `?${new URLSearchParams({ path })}` : '';
  const tree = await historyRequest<VersionHistoryTree>(
    api,
    `/api/me/studio/games/${historySlug(slug)}/versions/${historyVersion(version)}/tree${query}`,
    signal,
  );
  if (!tree.metadata || tree.metadata.version !== version || !Array.isArray(tree.files))
    throw new CliError('server does not support version metadata yet; update the platform API', EXIT_REFUSED);
  return tree;
}
