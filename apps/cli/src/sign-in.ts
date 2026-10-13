import { runDeviceLogin, shouldOpenLoginBrowser, type DeviceLoginInput } from './device-login.js';
import { runLoopbackLogin } from './login.js';
import { withPlaySignals } from './play-signals.js';

export type LoginFlow = 'loopback' | 'device';

// Remote shells cannot reach a local callback, so they use Device Flow.
export function defaultLoginFlow(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): LoginFlow {
  return shouldOpenLoginBrowser(env, platform) ? 'loopback' : 'device';
}

export async function runLogin(input: DeviceLoginInput & { flow?: LoginFlow }): Promise<void> {
  const flow = input.flow ?? defaultLoginFlow(input.env ?? process.env);
  const run = (abort: AbortSignal) => {
    const options = { ...input, abort };
    return flow === 'loopback' ? runLoopbackLogin(options) : runDeviceLogin(options);
  };
  if (input.abort) await run(input.abort);
  else await withPlaySignals(run);
}
