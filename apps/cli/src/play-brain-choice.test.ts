import { describe, expect, it } from 'vitest';
import { brainChoice, brainRequested, parseBrainChoice } from './play-brain-choice.js';

describe('brain choice', () => {
  it('keeps the workshop unless the creator asks for the Play agent', () => {
    expect(brainChoice({})).toBe('repl');
    expect(brainChoice({ GAMEDEVPL_BRAIN: 'nonsense' })).toBe('repl');
    expect(brainRequested({ GAMEDEVPL_BRAIN: 'app-agent' })).toBe(true);
    expect(brainRequested({ GAMEDEVPL_BRAIN: 'auto' })).toBe(true);
    expect(brainRequested({ GAMEDEVPL_BRAIN: 'repl' })).toBe(false);
  });

  it('refuses a --brain without a known mode', () => {
    expect(parseBrainChoice('auto')).toBe('auto');
    expect(() => parseBrainChoice(true)).toThrow(/--brain needs a mode/);
    expect(() => parseBrainChoice('gpt')).toThrow(/--brain needs a mode/);
  });
});
