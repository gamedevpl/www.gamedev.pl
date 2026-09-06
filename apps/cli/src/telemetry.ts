import { randomUUID } from 'node:crypto';
import { CLI_ADAPTERS, type CliStep, type CliVerifyStage } from '@gamedevpl/contract';

export type CliTelemetry = {
  record: (step: CliStep, adapter?: string, stage?: CliVerifyStage) => void;
  flush: () => Promise<void>;
};

export function createCliTelemetry(origin: string, send: typeof fetch = fetch): CliTelemetry {
  const visitId = randomUUID();
  const started = Date.now();
  const pending = new Set<Promise<void>>();
  let count = 0;
  return {
    record(step, adapter, stage) {
      if (++count > 200) return;
      const msSinceStart = Math.min(86_400_000, Math.max(0, Date.now() - started));
      const event = {
        type: 'cli_step',
        step,
        msSinceStart,
        ...(adapter ? { adapter: (CLI_ADAPTERS as readonly string[]).includes(adapter) ? adapter : 'custom' } : {}),
        ...(stage ? { stage } : {}),
      };
      const task = Promise.resolve()
        .then(() =>
          send(`${origin}/api/telemetry/visit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ visitId, flushMsSinceStart: msSinceStart, events: [event] }),
            signal: AbortSignal.timeout(2000),
          }),
        )
        .then(
          () => undefined,
          () => undefined,
        );
      pending.add(task);
      void task.finally(() => pending.delete(task));
    },
    async flush() {
      await Promise.all(pending);
    },
  };
}
