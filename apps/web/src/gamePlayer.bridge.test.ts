// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { embedGameHtml } from './gamePlayer';

/**
 * Runs the injected bridge for real rather than grepping its source.
 *
 * The bridge is a string of inline JS that only ever executes inside a sandboxed,
 * opaque-origin iframe — the one place no test can reach. jsdom gets us the next best
 * thing: `window.parent === window` here, so the bridge's `parent.postMessage` lands
 * on a listener we control, and we can assert the health signals actually fire instead
 * of asserting that the characters spelling them are present.
 */

const BRIDGE_SOURCE = (() => {
  const html = embedGameHtml('<html><head></head><body><canvas id="game"></canvas></body></html>');
  // Index-based extract — avoid HTML-tag regexes (js/bad-tag-filter). The bridge
  // inject is a single exact `<script>…</script>` pair from embedGameHtml.
  const startMarker = '<script>';
  const endMarker = '</script>';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start < 0 || end < 0) throw new Error('embedGameHtml stopped injecting a script — the bridge contract changed');
  return html.slice(start + startMarker.length, end);
})();

type BridgeMessage = { source?: string; type?: string; message?: string; frames?: number };

/**
 * Each run gets its own iframe, and therefore its own JS realm. That matters for more
 * than tidiness: the bridge attaches window listeners it has no way to remove, so
 * running two in one realm would have every dispatch answered twice — an artifact of
 * the test, not of the product.
 */
function runBridge(bodyHtml = '') {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  // The frame's own realm has its own constructors, and using them (rather than this
  // module's) is what makes the dispatched events visible to listeners inside it.
  const frameWindow = frame.contentWindow as (Window & typeof globalThis) | null;
  if (!frameWindow) throw new Error('no iframe realm');
  frameWindow.document.body.innerHTML = bodyHtml;

  const received: BridgeMessage[] = [];
  const listener = (event: MessageEvent) => {
    // Production sandboxed frames use origin "null". jsdom's iframe postMessage
    // reports "" here; accept both so the harness still sees bridge traffic.
    if (event.origin !== 'null' && event.origin !== '') return;
    received.push(event.data as BridgeMessage);
  };
  window.addEventListener('message', listener);

  // Runs in the frame's realm, so the bridge's `parent` is this window — exactly the
  // relationship it has in the real player.
  new frameWindow.Function(BRIDGE_SOURCE)();

  return {
    received,
    frameWindow,
    stop: () => {
      window.removeEventListener('message', listener);
      frame.remove();
    },
  };
}

/** postMessage is queued as a task in jsdom, so give it one turn to be delivered. */
const delivered = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the injected bridge reports health', () => {
  it('reports an uncaught error, truncated', async () => {
    const bridge = runBridge();

    bridge.frameWindow.dispatchEvent(new bridge.frameWindow.ErrorEvent('error', { message: 'x'.repeat(500) }));
    await delivered();

    const errors = bridge.received.filter((message) => message.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].source).toBe('gdpl-player');
    expect(errors[0].message).toBe('x'.repeat(200));
    bridge.stop();
  });

  it('reports an unhandled promise rejection', async () => {
    const bridge = runBridge();

    // jsdom does not synthesize PromiseRejectionEvent from a real rejection, so the
    // event is dispatched directly — what matters is that the handler is wired.
    const event = new bridge.frameWindow.Event('unhandledrejection') as Event & { reason?: unknown };
    event.reason = new Error('save failed');
    bridge.frameWindow.dispatchEvent(event);
    await delivered();

    expect(bridge.received.filter((m) => m.type === 'error').map((m) => m.message)).toEqual(['save failed']);
    bridge.stop();
  });

  it('still reports the game title, so the health additions did not break the meta contract', async () => {
    const bridge = runBridge('<h1 id="game-title">Space Hop</h1><p id="game-desc">Hop in space</p>');
    await delivered();

    const meta = bridge.received.find((message) => message.type === 'meta') as
      (BridgeMessage & { title?: string; desc?: string }) | undefined;
    expect(meta?.title).toBe('Space Hop');
    expect(meta?.desc).toBe('Hop in space');
    bridge.stop();
  });
});
