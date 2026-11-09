import type { handleReplLine } from './repl.js';
import { checkoutAgentTask } from './checkout-agent.js';
import { workshopTurn } from './workshop.js';
import { formatError } from './errors.js';

export async function retryWorkshop(input: Parameters<typeof handleReplLine>[0]): Promise<void> {
  const ws = input.workshop;
  const task = ws?.failedTask;
  if (!ws || !task) {
    input.write('no pending task to retry');
    return;
  }
  try {
    const run = task.localOnly ? checkoutAgentTask : workshopTurn;
    await run({ api: input.api, ws, ...task, retry: true, write: input.write });
  } catch (error) {
    input.write(formatError(error));
  }
}
