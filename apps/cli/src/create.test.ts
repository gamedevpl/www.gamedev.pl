import { describe, expect, it } from 'vitest';
import { answersFromFlags } from './create.js';
import { EXIT_INPUT } from './exit-codes.js';

describe('create intake', () => {
  it('refuses refine questions in a pipe without --answers', () => {
    try {
      answersFromFlags({}, [{ id: 'tone', prompt: 'tone?' }]);
      throw new Error('expected throw');
    } catch (error) {
      expect((error as { exitCode: number }).exitCode).toBe(EXIT_INPUT);
    }
  });

  it('accepts --answers JSON for non-TTY', () => {
    expect(answersFromFlags({ answers: '{"tone":"calm"}' }, [{ id: 'tone', prompt: 'tone?' }])).toEqual({
      tone: 'calm',
    });
  });
});
