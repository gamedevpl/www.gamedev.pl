// Prior chat turns kept for the Studio chat prompt.

export type ChatTurn = {
  message: string;
  reply?: string;
  built?: boolean;
  ackText?: string;
  origin?: 'agent';
};

export const MAX_CHAT_TURNS = 5;

export function rememberChatTurn(turns: ChatTurn[], turn: ChatTurn): ChatTurn[] {
  const next = [...turns, turn];
  return next.length > MAX_CHAT_TURNS ? next.slice(next.length - MAX_CHAT_TURNS) : next;
}
