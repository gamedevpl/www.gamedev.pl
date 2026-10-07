import { isFromGameFrame } from '../../frameMessage.js';

// Matches RemixPanel's crash watch window.
const SWAP_WATCH_MS = 6_000;
// Cap for a document that never sends its first heartbeat.
const DREW_NOTHING_CHECK_MS = 15_000;

export type SwapWatchHandlers = {
  crash: (message: string) => void;
  blank: () => void;
  drew: () => void;
  good: () => void;
};

// Judges a swapped document by its own heartbeat; returns stop().
export function watchSwap(frame: () => HTMLIFrameElement | null, on: SwapWatchHandlers): () => void {
  let sawFrame = false;
  let sawAlive = false;
  let watchElapsed = false;
  let reportedBlank = false;
  function reportBlank() {
    if (sawFrame || reportedBlank) return;
    reportedBlank = true;
    on.blank();
  }
  function onMessage(event: MessageEvent) {
    if (event.origin !== 'null' || !isFromGameFrame(event, frame())) return;
    const data = event.data as { source?: string; type?: string; message?: string; frames?: number } | null;
    if (data?.source !== 'gdpl-player') return;
    if (data.type === 'error') {
      on.crash(String(data.message ?? '').slice(0, 200));
      stop();
      return;
    }
    if (data.type !== 'alive') return;
    sawAlive = true;
    if (Number(data.frames ?? 0) > 0) {
      // Sticky: a later quiet window must not flip it back.
      sawFrame = true;
      if (reportedBlank) {
        reportedBlank = false;
        on.drew();
      }
      if (watchElapsed) {
        on.good();
        stop();
      }
      return;
    }
    // Hidden tabs stop rAF, so zero frames proves nothing.
    if (document.visibilityState !== 'hidden') reportBlank();
  }
  function stop() {
    window.removeEventListener('message', onMessage);
    window.clearTimeout(errorTimer);
    window.clearTimeout(drewNothingTimer);
  }
  const errorTimer = window.setTimeout(() => {
    watchElapsed = true;
    if (!sawFrame) return;
    on.good();
    stop();
  }, SWAP_WATCH_MS);
  // Keeps listening after this: a later frame clears the verdict.
  const drewNothingTimer = window.setTimeout(() => {
    if (!sawAlive && document.visibilityState !== 'hidden') reportBlank();
  }, DREW_NOTHING_CHECK_MS);
  window.addEventListener('message', onMessage);
  return stop;
}
