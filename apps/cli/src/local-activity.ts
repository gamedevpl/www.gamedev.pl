import { randomUUID } from 'node:crypto';
import type { LocalActivity } from '@gamedevpl/contract';
import type { ApiClient } from './api.js';
export function localActivity(api: ApiClient | undefined, token: string, agent: string) {
  const runId = randomUUID();
  let phase: LocalActivity['phase'] = 'preparing';
  let started = false;
  let stopped = false;
  let pending: Promise<void> | undefined;
  const send = (): Promise<void> => {
    if (pending) return pending;
    if (!api) return Promise.resolve();
    const start = !started;
    started = true;
    const sentPhase = start ? 'preparing' : phase;
    let ok = false;
    pending = (async () => {
      try {
        await api.request(
          'POST',
          `/api/me/studio/local-activity/${encodeURIComponent(token)}`,
          {
            runId,
            agent,
            phase: sentPhase,
            ...(start ? { start: true } : {}),
          },
          AbortSignal.timeout(5000),
        );
        ok = true;
      } catch {
        // Local edits survive disconnection.
      } finally {
        pending = undefined;
        if (!stopped && ok && phase !== sentPhase) void send();
      }
    })();
    return pending;
  };
  void send();
  const timer = setInterval(() => {
    if (!stopped) void send();
  }, 15_000);
  timer.unref();
  return {
    phase(value: LocalActivity['phase']) {
      phase = value;
      void send();
    },
    async finish(value: LocalActivity['phase']) {
      stopped = true;
      clearInterval(timer);
      phase = value;
      // Drain the bounded in-flight request, then flush the terminal phase.
      await pending;
      await send();
    },
  };
}
