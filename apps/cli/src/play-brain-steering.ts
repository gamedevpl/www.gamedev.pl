import type { CodingAgent } from 'genaicode/agents';
import type { AppAgent } from 'genaicode/app-agent';
import type { Steer, SteerReceipt } from './live-agent.js';

export function trackPlaySteering() {
  let capturing = false;
  let confirmation: Promise<void> | undefined;
  return {
    wrap(agent: CodingAgent): CodingAgent {
      return {
        name: agent.name,
        command: agent.command,
        capabilities: agent.capabilities,
        run(task) {
          const run = agent.run(task);
          if (!run.steer) return run;
          return {
            result: run.result,
            abort: () => run.abort(),
            [Symbol.asyncIterator]: () => run[Symbol.asyncIterator](),
            steer(text) {
              const result = run.steer!(text);
              if (capturing) confirmation = result;
              return result;
            },
          };
        },
      };
    },
    send(agent: Pick<AppAgent, 'send'>): Steer {
      return async (text): Promise<SteerReceipt> => {
        confirmation = undefined;
        capturing = true;
        try {
          agent.send(text);
          return confirmation ? { status: 'pending', confirmation } : { status: 'queued' };
        } finally {
          capturing = false;
          confirmation = undefined;
        }
      };
    },
  };
}
