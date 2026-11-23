import { describe, expect, it } from 'vitest';
import type { ApprovalRequest } from 'genaicode/agents';
import { askQuestions, questionPrompt, SKIP_QUESTION } from './play-questions.js';

const request = (questions: ApprovalRequest['questions']): ApprovalRequest => ({
  id: 'ask-1',
  kind: 'question',
  scope: 'once',
  questions,
});

describe('askQuestions', () => {
  it('asks each question and keeps the picked labels', async () => {
    const asked: string[][] = [];
    const answers = await askQuestions(
      'claude',
      request([
        {
          id: 'a',
          question: 'Which art style?',
          options: [{ label: 'Pixel', description: '8-bit' }, { label: 'Vector' }],
        },
        { id: 'b', question: 'Add music?', options: [{ label: 'Yes' }, { label: 'No' }] },
      ]),
      async (choices) => {
        asked.push(choices);
        return choices[0] === 'Pixel' ? 'Pixel' : SKIP_QUESTION;
      },
    );
    expect(asked).toEqual([
      ['Pixel', 'Vector', SKIP_QUESTION],
      ['Yes', 'No', SKIP_QUESTION],
    ]);
    expect(answers).toEqual({ a: ['Pixel'] });
  });

  it('returns undefined when the browser answered first', async () => {
    const answers = await askQuestions(
      'codex',
      request([{ id: 'a', question: 'Which?', options: [{ label: 'One' }] }]),
      async () => undefined,
    );
    expect(answers).toBeUndefined();
  });

  it('only offers a skip for typed or secret questions', async () => {
    let shown = '';
    const answers = await askQuestions(
      'codex',
      request([{ id: 'k', question: 'API key?', options: [], secret: true }]),
      async (choices, text) => {
        shown = text;
        expect(choices).toEqual([SKIP_QUESTION]);
        return SKIP_QUESTION;
      },
    );
    expect(shown).toContain('Answer it in the browser');
    expect(answers).toEqual({});
  });

  it('formats the header, counter and option descriptions', () => {
    const text = questionPrompt(
      'claude',
      { id: 'a', header: 'Style', question: 'Which?', options: [{ label: 'Pixel', description: '8-bit' }] },
      0,
      2,
    );
    expect(text).toBe('claude asks (1/2):\n[Style] Which?\n• Pixel — 8-bit');
  });

  it('waits for the browser on typed questions after the picks', async () => {
    const asked: string[][] = [];
    const answers = await askQuestions(
      'claude',
      request([
        { id: 'a', question: 'Which style?', options: [{ label: 'Pixel' }] },
        { id: 't', question: 'What title?', options: [], freeText: true },
      ]),
      async (choices) => {
        asked.push(choices);
        return choices.length > 1 ? 'Pixel' : undefined;
      },
    );
    expect(asked).toEqual([['Pixel', SKIP_QUESTION], [SKIP_QUESTION]]);
    expect(answers).toBeUndefined();
  });
});
