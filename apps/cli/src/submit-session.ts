import type { ApiClient } from './api.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

export type DeliverySession = { locked: boolean; canTakeOver: boolean; jobId: number; generation: number };
export async function deliverySession(api: ApiClient, slug: string): Promise<DeliverySession | null> {
  try {
    return await api.request<DeliverySession>(
      'GET',
      `/api/me/studio/games/${encodeURIComponent(slug)}/sources/session`,
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'not found') return null;
    throw error;
  }
}
export async function prepareDeliverySession(
  api: ApiClient,
  slug: string,
  takeover = false,
  expected?: DeliverySession,
): Promise<boolean> {
  const session = expected ?? (await deliverySession(api, slug));
  if (!session?.locked) return false;
  if (!takeover || !session.canTakeOver)
    throw new CliError(
      'Delivery is blocked by an open agent session. Your local files are safe.',
      EXIT_REFUSED,
      session.canTakeOver
        ? 'gamedevpl submit --takeover — disconnect that agent and deliver your local checkout'
        : 'Finish the active agent or its pending handoff in Studio, then retry.',
    );
  await api.request('POST', `/api/me/studio/games/${encodeURIComponent(slug)}/sources/session`, {
    jobId: session.jobId,
    generation: session.generation,
    stopAgent: true,
  });
  return true;
}
