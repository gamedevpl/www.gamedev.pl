import { localActivity } from './local-activity.js';
import type { Workshop } from './workshop.js';

export function playBrainPresence(input: {
  ws: Workshop;
  agent: string;
  signal: AbortSignal;
  track?: typeof localActivity;
}) {
  const start = () => input.track?.(input.ws.activityApi, input.ws.token, input.agent);
  let current = start();
  return {
    phase(value: Parameters<ReturnType<typeof localActivity>['phase']>[0]) {
      current?.phase(value);
    },
    async retarget() {
      const previous = current;
      current = undefined;
      await previous?.finish('ready');
      if (!input.signal.aborted) {
        current = start();
        current?.phase('editing');
      }
    },
    async finish(value: Parameters<ReturnType<typeof localActivity>['finish']>[0]) {
      await current?.finish(value);
    },
  };
}

export function roundWithPresence(
  ws: Workshop,
  open: (request: string, signal: AbortSignal) => Promise<string>,
  retarget: () => Promise<void> | undefined,
) {
  return async (request: string, signal: AbortSignal) => {
    const previous = ws.token;
    try {
      return await open(request, signal);
    } finally {
      if (previous !== ws.token) await retarget();
    }
  };
}
