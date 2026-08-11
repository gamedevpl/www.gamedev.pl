import { describe, expect, it } from 'vitest';
import { MAX_CHAT_TURNS, rememberChatTurn, type ChatTurn } from './chat-turns.js';

describe('rememberChatTurn', () => {
  it('appends and caps at MAX_CHAT_TURNS, dropping the oldest', () => {
    let turns: ChatTurn[] = [];
    for (let i = 0; i < MAX_CHAT_TURNS + 3; i++) {
      turns = rememberChatTurn(turns, { message: `turn ${i}` });
    }
    expect(turns).toHaveLength(MAX_CHAT_TURNS);
    expect(turns[0].message).toBe(`turn ${3}`);
    expect(turns[turns.length - 1].message).toBe(`turn ${MAX_CHAT_TURNS + 2}`);
  });
});
