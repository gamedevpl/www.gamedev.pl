import type { ApiClient } from './api.js';
import { cliUsage } from './bin-name.js';
import { CliError, EXIT_INPUT } from './exit-codes.js';

export async function studioToken(api: ApiClient, slug: string): Promise<string> {
  const studio = await api.request<{ games?: Array<{ slug?: string; token?: string; title?: string }> }>(
    'GET',
    `/api/me/studio?game=${encodeURIComponent(slug)}`,
  );
  const row = (studio.games ?? []).find((game) => game.slug === slug);
  if (!row?.token) {
    const recovery = await api
      .request<{ kind: string }>('GET', `/api/me/studio/games/${encodeURIComponent(slug)}/recovery`)
      .catch(() => null);
    throw new CliError(
      recovery?.kind === 'canceled'
        ? `The round for ${slug} was canceled. Local sources can be recovered.`
        : `no owned game ${slug}`,
      EXIT_INPUT,
      `${cliUsage('games')} lists accessible games. If you have local sources after cancellation/deletion: gamedevpl recover <checkout-directory>; to create a new game, run gamedevpl and describe your idea`,
    );
  }
  return row.token;
}

export async function studioTitle(api: ApiClient, slug: string): Promise<string | undefined> {
  const studio = await api.request<{ games?: Array<{ slug?: string; title?: string }> }>(
    'GET',
    `/api/me/studio?game=${encodeURIComponent(slug)}`,
  );
  return (studio.games ?? []).find((game) => game.slug === slug)?.title;
}
