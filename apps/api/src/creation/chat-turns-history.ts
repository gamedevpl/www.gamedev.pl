import { MAX_CHAT_TURNS, rememberChatTurn, type ChatTurn } from './chat-turns.js';
import { stripPlaytestContext } from '../delivery/build-transcript.js';
import type { CreatorMessage } from '../platform/store.js';

export { MAX_CHAT_TURNS, rememberChatTurn, type ChatTurn };

export function reconstructChatTurns(messages: readonly CreatorMessage[]): ChatTurn[] {
  let turns: ChatTurn[] = [];
  let pending: string | null = null;
  for (const message of messages) {
    if (message.origin === 'studio') {
      if (pending !== null) {
        turns = rememberChatTurn(turns, { message: pending, reply: message.text });
        pending = null;
      }
      continue;
    }
    if (message.origin === 'studio_ack') {
      if (pending !== null) {
        turns = rememberChatTurn(turns, { message: pending, built: true, ackText: message.text });
        pending = null;
      }
      continue;
    }
    if (pending !== null) turns = rememberChatTurn(turns, { message: pending, built: true });
    pending = stripPlaytestContext(message.text);
  }
  if (pending !== null) turns = rememberChatTurn(turns, { message: pending, built: true });
  return turns;
}

export async function loadRecentChatTurns(
  store: { listCreatorMessages: (jobId: number, opts?: { limit?: number }) => Promise<CreatorMessage[]> },
  jobId: number,
): Promise<ChatTurn[]> {
  const raw = await store.listCreatorMessages(jobId, { limit: MAX_CHAT_TURNS * 3 });
  return reconstructChatTurns(raw);
}
