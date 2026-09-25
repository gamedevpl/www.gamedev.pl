import { runHeadlessAgent, type AdapterRun } from './headless-agent.js';
import { runMuseWithApprovals } from './muse-approval.js';
import { liveArgs, runLiveAgent } from './live-agent.js';

export const defaultAdapterRun: AdapterRun = async (input) => {
  if (input.onSteering && liveArgs(input.spec)) return runLiveAgent(input);
  return runMuseWithApprovals(input, (args) => runHeadlessAgent({ ...args, timeoutMs: 30 * 60_000 }));
};
