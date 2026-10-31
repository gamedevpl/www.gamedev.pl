import { expect, it } from 'vitest';
import type { AppAgentState } from 'genaicode/react';
import { playLines } from '../browser/play-lines.js';

it('keeps restored steering history when the same message is sent again', () => {
  const agent = {
    history: [],
    session: { turns: [{ prompt: 'Current task', entries: [] }] },
  } as unknown as AppAgentState;
  const old = '› [sent to active agent] Try a backflip';
  const current = '› [message to agent] Try a backflip';
  const lines = ['Previous conversation (local history):', old, 'Current session:', current];
  expect(playLines(lines, agent, [{ id: 1, text: 'Try a backflip', status: 'pending' }])).toEqual(lines.slice(0, 3));
  expect(playLines(lines, agent, [])).toEqual(lines);
});
