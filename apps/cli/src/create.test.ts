import { describe, expect, it } from 'vitest';
import { answerDraft, answersFromFlags, formatQuestion } from './create.js';
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

  it('maps invalid --answers JSON to EXIT_INPUT', () => {
    try {
      answersFromFlags({ answers: '{nope' }, [{ id: 'tone', prompt: 'tone?' }]);
      throw new Error('expected throw');
    } catch (error) {
      expect((error as { exitCode: number }).exitCode).toBe(EXIT_INPUT);
    }
  });

  it('advances a refine draft to a submit spec', () => {
    const draft = {
      concept: 'robots water plants',
      title: 'Robot Garden',
      questions: [{ id: 'tone', prompt: 'What tone?' }],
      index: 0,
      answers: {},
    };
    expect(formatQuestion(draft)).toContain('What tone?');
    expect(answerDraft(draft, 'calm')).toEqual({
      kind: 'ready',
      title: 'Robot Garden',
      concept: 'robots water plants\n\nWhat tone?: calm',
    });
  });
});
