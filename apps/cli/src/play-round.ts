import type { ApiClient } from './api.js';
import { getStatus, type TurnResult } from './turn.js';
import type { Workshop } from './workshop.js';

// Published games need a new self-built round before the agent edits.
export function playRound(api: ApiClient, ws: Workshop, opened: (token: string) => void) {
  return async (request: string, signal?: AbortSignal): Promise<string> => {
    signal?.throwIfAborted();
    const status = await getStatus(api, ws.token);
    signal?.throwIfAborted();
    if (status.status === 'published') {
      const result = await api.request<{ ok?: boolean; token?: string; slug?: string; reply?: string } | null>(
        'POST',
        `/api/submissions/${encodeURIComponent(ws.token)}/improve`,
        { feedback: request, builder: 'self' },
        ...(signal ? [signal] : []),
      );
      if (!result || result.ok !== true)
        throw Error('The platform returned an invalid improvement receipt. Check Studio before retrying.');
      if (!result.token && !result.slug && typeof result.reply === 'string')
        return `The platform did not open a round. Change nothing. ${result.reply?.trim() || 'Ask the creator to clarify the request.'}`;
      if (!result.token || !result.slug)
        throw Error('The platform returned an incomplete round receipt. Check Studio before retrying.');
      if (result.slug !== ws.slug) throw Error('The platform opened a round for a different game. Change nothing.');
      ws.token = result.token;
      ws.builder = 'self';
      opened(result.token);
      return 'A self-built improvement round is open. You can now make the requested changes.';
    }
    if (status.builder && status.builder !== 'self')
      return 'The platform owns this round. Change nothing; ask the creator to switch builders.';
    const result = await api.request<TurnResult>(
      'POST',
      `/api/submissions/${encodeURIComponent(ws.token)}/turn`,
      { text: request },
      ...(signal ? [signal] : []),
    );
    return result.kind === 'reply'
      ? `The platform answered instead of opening a round:\n${result.text}`
      : `Round ${result.roundId} is open.${result.ack ? ` Platform note: ${result.ack}` : ''}`;
  };
}
