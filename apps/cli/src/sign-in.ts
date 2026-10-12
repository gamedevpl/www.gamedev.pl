import { runDeviceLogin, type DeviceLoginInput } from './device-login.js';
import { runLoopbackLogin } from './login.js';
import { withPlaySignals } from './play-signals.js';

export async function runLogin(input: DeviceLoginInput & { loopback?: boolean }): Promise<void> {
  const run = (abort: AbortSignal) => {
    const options = { ...input, abort };
    return input.loopback ? runLoopbackLogin(options) : runDeviceLogin(options);
  };
  if (input.abort) await run(input.abort);
  else await withPlaySignals(run);
}
