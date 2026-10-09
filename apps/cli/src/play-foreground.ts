import { setTimeout as delay } from 'node:timers/promises';
import { playGame } from './play.js';
import { holdPreview } from './play-presence.js';
import { withPlaySignals } from './play-signals.js';

export function playForeground(input: Parameters<typeof playGame>[0]) {
  return withPlaySignals(async (signal) => {
    let played: Awaited<ReturnType<typeof playGame>>;
    try {
      played = await playGame({ ...input, abort: signal, detached: false });
    } catch (error) {
      if (signal.aborted) return { mode: 'local' as const };
      throw error;
    }
    if (played.mode !== 'local' || !played.url) return played;
    const owner = new AbortController();
    const presence = holdPreview(played.url, AbortSignal.any([signal, owner.signal]));
    input.write('Keep this terminal open. Ctrl+C stops the local preview. Use --detach to run in the background.');
    try {
      while (!signal.aborted) {
        try {
          const response = await fetch(`${played.url}status`, {
            signal: AbortSignal.timeout(2000),
            redirect: 'error',
          });
          await response.body?.cancel();
        } catch (error) {
          if ((error as { cause?: NodeJS.ErrnoException }).cause?.code === 'ECONNREFUSED') break;
        }
        await delay(1000, undefined, { signal }).catch(() => undefined);
      }
      if (signal.aborted) {
        try {
          const response = await fetch(`${played.url}stop`, {
            method: 'POST',
            headers: { Origin: new URL(played.url).origin },
            signal: AbortSignal.timeout(2000),
            redirect: 'error',
          });
          await response.body?.cancel();
          if (!response.ok) throw Error(`Local preview refused stop (${response.status}).`);
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
        }
      }
      return played;
    } finally {
      owner.abort();
      await presence;
    }
  });
}
