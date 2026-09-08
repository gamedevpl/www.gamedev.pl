import { randomUUID } from 'node:crypto';
import {
  CLI_ADAPTERS,
  type CliInstallChannel,
  type CliPlatformOs,
  type CliStep,
  type CliVerifyStage,
} from '@gamedevpl/contract';

// Closed dimensions only; never a path, a prompt, or a game title.
export type CliStepDims = {
  adapter?: string;
  stage?: CliVerifyStage;
  channel?: CliInstallChannel;
  os?: CliPlatformOs;
};

export type CliTelemetry = {
  record: (step: CliStep, dims?: CliStepDims) => void;
  flush: () => Promise<void>;
};

export function createCliTelemetry(origin: string, send: typeof fetch = fetch): CliTelemetry {
  const visitId = randomUUID();
  const started = Date.now();
  const pending = new Set<Promise<void>>();
  let count = 0;
  return {
    record(step, dims) {
      if (++count > 200) return;
      const msSinceStart = Math.min(86_400_000, Math.max(0, Date.now() - started));
      const adapter = dims?.adapter;
      const event = {
        type: 'cli_step',
        step,
        msSinceStart,
        ...(adapter ? { adapter: (CLI_ADAPTERS as readonly string[]).includes(adapter) ? adapter : 'custom' } : {}),
        ...(dims?.stage ? { stage: dims.stage } : {}),
        ...(dims?.channel ? { channel: dims.channel } : {}),
        ...(dims?.os ? { os: dims.os } : {}),
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
