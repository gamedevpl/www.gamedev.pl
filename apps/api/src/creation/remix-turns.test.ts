import { describe, expect, it } from 'vitest';
import { formatRemixTurns, MAX_REMIX_TURNS, rememberRemixTurn } from './remix-turns.js';

describe('remix turns', () => {
  it('formats prior turns for the model, including summaries', () => {
    const block = formatRemixTurns([
      { utterance: 'make it faster', summary: 'Raised the speed.' },
      { utterance: 'again' },
    ]);
    expect(block).toContain('Earlier in this remix');
    expect(block).toContain('1. Player: make it faster');
    expect(block).toContain('→ Raised the speed.');
    expect(block).toContain('2. Player: again');
  });

  it('returns empty when there is nothing prior', () => {
    expect(formatRemixTurns([])).toBe('');
  });

  it('keeps only the newest turns past the ceiling', () => {
    let turns = rememberRemixTurn([], { utterance: 'first' });
    for (let i = 2; i <= MAX_REMIX_TURNS + 2; i += 1) {
      turns = rememberRemixTurn(turns, { utterance: `turn-${i}` });
    }
    expect(turns).toHaveLength(MAX_REMIX_TURNS);
    expect(turns[0]?.utterance).toBe('turn-3');
    expect(turns.at(-1)?.utterance).toBe(`turn-${MAX_REMIX_TURNS + 2}`);
  });
});
