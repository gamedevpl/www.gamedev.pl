import { MAX_CHAT_TURNS, rememberChatTurn, type ChatTurn } from './chat-turns.js';
import { stripPlaytestContext } from '../delivery/build-transcript.js';
import type { CreatorMessage } from '../platform/store.js';

export { MAX_CHAT_TURNS, rememberChatTurn, type ChatTurn };

function pendingText(message: CreatorMessage): string {
  const localized = message.origin === 'agent' ? message.textLocalized?.trim() : undefined;
  return stripPlaytestContext(localized || message.text);
}

function flushPending(
  turns: ChatTurn[],
  pending: { text: string; origin?: 'agent' } | null,
  extra: Omit<ChatTurn, 'message' | 'origin'>,
): ChatTurn[] {
  if (pending === null) return turns;
  return rememberChatTurn(turns, {
    message: pending.text,
    ...extra,
    ...(pending.origin ? { origin: pending.origin } : {}),
  });
}

export function reconstructChatTurns(messages: readonly CreatorMessage[]): ChatTurn[] {
  let turns: ChatTurn[] = [];
  let pending: { text: string; origin?: 'agent' } | null = null;
  for (const message of messages) {
    if (message.origin === 'studio') {
      turns = flushPending(turns, pending, { reply: message.text });
      pending = null;
      continue;
    }
    if (message.origin === 'studio_ack') {
      turns = flushPending(turns, pending, { built: true, ackText: message.text });
      pending = null;
      continue;
    }
    if (pending !== null) turns = flushPending(turns, pending, { built: true });
    pending = {
      text: pendingText(message),
      ...(message.origin === 'agent' ? { origin: 'agent' as const } : {}),
    };
  }
  return flushPending(turns, pending, { built: true });
}

export async function loadRecentChatTurns(
  store: { listCreatorMessages: (jobId: number, opts?: { limit?: number }) => Promise<CreatorMessage[]> },
  jobId: number,
): Promise<ChatTurn[]> {
  const raw = await store.listCreatorMessages(jobId, { limit: MAX_CHAT_TURNS * 3 });
  return reconstructChatTurns(raw);
}
