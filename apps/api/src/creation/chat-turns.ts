// Prior chat turns — same shape as remix-turns.ts's RemixTurn.

export type ChatTurn = {
  message: string;
  reply?: string;
  built?: boolean;
  // Meaningful only with built: true.
  ackText?: string;
};

export const MAX_CHAT_TURNS = 5;

export function rememberChatTurn(turns: ChatTurn[], turn: ChatTurn): ChatTurn[] {
  const next = [...turns, turn];
  return next.length > MAX_CHAT_TURNS ? next.slice(next.length - MAX_CHAT_TURNS) : next;
}
