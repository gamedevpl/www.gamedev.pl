import { setTimeout as delay } from 'node:timers/promises';

type Evaluate = (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export const CAPTURE_READY_BRIDGE = `<script>
(() => {
  const ready = () => {
    if (window.__GAME_HARNESS__ && window.__GAME_HARNESS__.ready !== true) {
      setTimeout(ready, 50);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      parent.postMessage({ source: 'gdpl-capture', type: 'ready' }, '*');
    }));
  };
  addEventListener('load', ready, { once: true });
})();
</script>`;

export async function waitForCaptureReady(call: Evaluate, url: string, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + 30_000;
  const expression = `location.href === ${JSON.stringify(new URL(url).href)} && document.readyState === 'complete' &&
    (!document.documentElement.hasAttribute('data-gamedev-capture') || window.__GAMEDEV_CAPTURE_READY__ === true)`;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    try {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true });
      if ((result.result as { value?: unknown } | undefined)?.value === true) {
        const painted = await call('Runtime.evaluate', {
          expression: 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))',
          awaitPromise: true,
          returnByValue: true,
        });
        if ((painted.result as { value?: unknown } | undefined)?.value === true) return;
      }
    } catch (error) {
      if (!(error instanceof Error) || !/context.*(destroyed|not found)|Cannot find context/i.test(error.message))
        throw error;
    }
    await delay(100, undefined, { signal });
  }
  throw new Error('Game did not become ready for capture within 30 seconds. Check the local preview for errors.');
}
