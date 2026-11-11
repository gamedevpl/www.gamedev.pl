import { expect, it } from 'vitest';
import type { AppAgent, AppAgentState } from 'genaicode/app-agent';
import { mirrorPlayBrain } from './play-brain-mirror.js';

it('mirrors a published artifact as a step line', () => {
  const lines: string[] = [];
  const state = {
    agent: 'claude',
    session: {
      status: 'idle',
      turns: [
        {
          id: 1,
          endedAt: 1,
          entries: [
            { kind: 'text', text: 'Here is the plan.' },
            { kind: 'artifact', artifact: { id: 'a'.repeat(32), title: 'Plan' } },
          ],
        },
      ],
    },
  } as unknown as AppAgentState;
  const agent = { subscribe: (listener: (state: AppAgentState) => void) => listener(state) } as unknown as AppAgent;
  mirrorPlayBrain(
    agent,
    (line) => lines.push(line),
    () => {},
  );
  expect(lines).toEqual(['Here is the plan.', '  · published "Plan" (see the Play browser tab)']);
});
