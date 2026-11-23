import { expect, it } from 'vitest';
import type { AppAgent } from 'genaicode/app-agent';
import { playAgentCommand } from './play-agent-command.js';

const fake = (calls: unknown[][]) =>
  ({
    get: () => ({ agent: 'claude' }),
    answer: (...args: unknown[]) => calls.push(['answer', ...args]),
    approve: () => {
      throw new Error('no such question');
    },
  }) as unknown as AppAgent;

it('forwards question card answers to the Play agent', () => {
  const calls: unknown[][] = [];
  const result = playAgentCommand(fake(calls), { kind: 'answer', id: 'ask-1', answers: { a: ['Pixel'] } });
  expect(result).toEqual({ status: 200, body: { agent: 'claude' } });
  expect(calls).toEqual([['answer', 'ask-1', { a: ['Pixel'] }]]);
});

it('refuses malformed answers, a missing agent and closed questions', () => {
  const calls: unknown[][] = [];
  expect(playAgentCommand(fake(calls), { kind: 'answer', id: 'q', answers: { a: 'Pixel' } }).status).toBe(400);
  expect(playAgentCommand(undefined, { kind: 'reset' }).status).toBe(404);
  const closed = playAgentCommand(fake(calls), { kind: 'approval', id: 'q', decision: 'deny' });
  expect(closed).toEqual({ status: 409, body: { error: 'no such question' } });
  expect(calls).toEqual([]);
});
