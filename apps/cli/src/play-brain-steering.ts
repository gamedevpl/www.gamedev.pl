import type { CodingAgent } from 'genaicode/agents';
import { userText, type AppAgent, type AppAgentState } from 'genaicode/app-agent';
import type { Steer, SteerReceipt } from './live-agent.js';

export function trackPlaySteering() {
  let capturing = false;
  let confirmation: Promise<void> | undefined;
  const captured = () => confirmation;
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
    send(agent: Pick<AppAgent, 'send' | 'get' | 'subscribe'>, signal: AbortSignal): Steer {
      const claimed = new Set<number>();
      return async (text): Promise<SteerReceipt> => {
        const existing = new Set(agent.get().session?.turns.map((turn) => turn.id));
        confirmation = undefined;
        capturing = true;
        try {
          agent.send(text);
          const waitForTurn = () =>
            new Promise<void>((resolve, reject) => {
              let off = () => {};
              let turnId: number | undefined;
              const done = (error?: Error) => {
                off();
                signal.removeEventListener('abort', stopped);
                if (error) reject(error);
                else resolve();
              };
              const stopped = () => done(new Error('Task stopped before the message was confirmed.'));
              const check = (state: AppAgentState) => {
                const turns = state.session?.turns ?? [];
                if (turnId === undefined) {
                  const next = turns.find(
                    (turn) =>
                      !existing.has(turn.id) && !claimed.has(turn.id) && userText(turn.prompt).trim() === text.trim(),
                  );
                  if (next) {
                    turnId = next.id;
                    claimed.add(next.id);
                  }
                }
                const turn = turns.find((item) => item.id === turnId);
                if (turn?.result)
                  done(turn.result.ok ? undefined : new Error('Queued turn did not finish successfully.'));
              };
              off = agent.subscribe(check);
              signal.addEventListener('abort', stopped, { once: true });
              if (signal.aborted) stopped();
              else check(agent.get());
            });
          const accepted = captured();
          return accepted
            ? { status: 'pending', confirmation: accepted.catch(() => waitForTurn()) }
            : { status: 'queued', confirmation: waitForTurn() };
        } finally {
          capturing = false;
          confirmation = undefined;
        }
      };
    },
  };
}
