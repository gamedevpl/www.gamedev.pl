import { createInterface } from 'node:readline';
import { spawnAdapter } from './delegate.js';
import { runMuseWithApprovals } from './muse-approval.js';
import { liveArgs, runLiveAgent } from './live-agent.js';
import type { AdapterRun } from './workshop.js';

export const defaultAdapterRun: AdapterRun = async (input) => {
  if (input.onSteering && liveArgs(input.spec)) return runLiveAgent(input);
  return runMuseWithApprovals(input, async (args) => {
    const child = await spawnAdapter({ ...args, timeoutMs: 30 * 60_000 });
    for (const stream of [child.stdout, child.stderr]) {
      if (stream) createInterface({ input: stream }).on('line', (line: string) => args.onLine?.(line));
    }
    return {
      code: await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      }),
    };
  });
};
