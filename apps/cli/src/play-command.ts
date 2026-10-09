import type { ApiClient } from './api.js';
import { findCheckout } from './checkout.js';
import { offerKitUpdate } from './kit-update.js';
import { playGame } from './play.js';
import { playForeground } from './play-foreground.js';
import { playApi } from './play-signals.js';

export async function playCommand(
  input: Parameters<typeof playGame>[0] & {
    api: ApiClient;
    apiForShutdown: (signal: AbortSignal) => ApiClient;
    asJson: boolean;
    noticeWrite: (line: string) => void;
  },
) {
  const beforePlay = async (abort?: AbortSignal) => {
    if (!findCheckout(input.cwd)) return;
    try {
      await offerKitUpdate({
        api: abort ? playApi(input.apiForShutdown(abort), abort) : input.api,
        cwd: input.cwd,
        env: input.env ?? process.env,
        telemetry: input.telemetry,
        write: input.noticeWrite,
        abort,
      });
    } catch {
      // Update discovery must not prevent offline local play.
    }
  };
  if (input.detached || input.asJson) {
    await beforePlay();
    return playGame({ ...input, detached: true });
  }
  return playForeground(input, beforePlay);
}
