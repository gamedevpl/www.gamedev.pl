// Prior chat turns — same shape as remix-turns.ts's RemixTurn.

export type ChatTurn = {
  message: string;
  reply?: string;
  built?: boolean;
};

export const MAX_CHAT_TURNS = 5;

export function rememberChatTurn(turns: ChatTurn[], turn: ChatTurn): ChatTurn[] {
  const next = [...turns, turn];
  return next.length > MAX_CHAT_TURNS ? next.slice(next.length - MAX_CHAT_TURNS) : next;
}

export function formatChatTurns(turns: ChatTurn[]): string {
  if (turns.length === 0) return '';
  const lines = turns.map((turn, index) => {
    const outcome = turn.built
      ? '\n   → (sent to the builder)'
      : turn.reply
        ? `\n   → ${turn.reply.slice(0, 200)}`
        : '';
    return `${index + 1}. Creator: ${turn.message.slice(0, 300)}${outcome}`;
  });
  return ['Earlier in this conversation (oldest first):', ...lines, ''].join('\n');
}
