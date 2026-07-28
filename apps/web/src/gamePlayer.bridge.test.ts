// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { embedGameHtml } from './gamePlayer.js';

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
  const end = start < 0 ? -1 : html.indexOf(endMarker, start + startMarker.length);
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

  it('reports a pointerdown so the host can dismiss overlays without covering the game', async () => {
    const bridge = runBridge('<canvas id="game"></canvas>');

    bridge.frameWindow.dispatchEvent(new bridge.frameWindow.PointerEvent('pointerdown'));
    await delivered();

    expect(bridge.received.filter((m) => m.type === 'pointer').map((m) => m.source)).toEqual(['gdpl-player']);
    bridge.stop();
  });

  it('cancels contextmenu and selectstart so iOS cannot open the callout over the game', () => {
    const bridge = runBridge('<canvas id="game"></canvas>');

    const contextMenu = new bridge.frameWindow.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    const selectStart = new bridge.frameWindow.Event('selectstart', {
      bubbles: true,
      cancelable: true,
    });

    expect(bridge.frameWindow.dispatchEvent(contextMenu)).toBe(false);
    expect(contextMenu.defaultPrevented).toBe(true);
    expect(bridge.frameWindow.dispatchEvent(selectStart)).toBe(false);
    expect(selectStart.defaultPrevented).toBe(true);
    bridge.stop();
  });

  it('pauses and resumes on host command, posting a snapshot', async () => {
    // jsdom's cross-realm postMessage into an iframe is unreliable; dispatch the
    // host envelope the same way the real parent would deliver it.
    const bridge = runBridge('<canvas id="game" width="40" height="20"></canvas>');
    const pauseEvents: Event[] = [];
    const resumeEvents: Event[] = [];
    bridge.frameWindow.document.addEventListener('gdpl-pause', (event) => pauseEvents.push(event));
    bridge.frameWindow.document.addEventListener('gdpl-resume', (event) => resumeEvents.push(event));

    // A game-style loop that looks up requestAnimationFrame each frame — the
    // bridge must hold it or Studio pause is only a veil.
    let ticks = 0;
    const frameWindow = bridge.frameWindow;
    function gameTick() {
      ticks += 1;
      frameWindow.requestAnimationFrame(gameTick);
    }
    frameWindow.requestAnimationFrame(gameTick);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const beforePause = ticks;
    expect(beforePause).toBeGreaterThan(0);

    bridge.frameWindow.dispatchEvent(
      new bridge.frameWindow.MessageEvent('message', {
        data: { source: 'gdpl-host', type: 'pause' },
      }),
    );
    await delivered();

    const snap = bridge.received.find((message) => message.type === 'snapshot') as
      (BridgeMessage & { png?: string | null; paused?: boolean; reason?: string }) | undefined;
    expect(snap?.source).toBe('gdpl-player');
    expect(snap?.paused).toBe(true);
    expect(snap?.reason).toBe('pause');
    expect(bridge.frameWindow.document.getElementById('gdpl-pause-overlay')).not.toBeNull();
    expect(pauseEvents).toHaveLength(1);

    // One already-scheduled native rAF may still fire; after that the hold must stick.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const afterScheduled = ticks;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(ticks).toBe(afterScheduled);

    bridge.frameWindow.dispatchEvent(
      new bridge.frameWindow.MessageEvent('message', {
        data: { source: 'gdpl-host', type: 'resume' },
      }),
    );
    await delivered();
    expect(bridge.received.some((message) => message.type === 'resumed')).toBe(true);
    expect(bridge.frameWindow.document.getElementById('gdpl-pause-overlay')).toBeNull();
    expect(resumeEvents).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(ticks).toBeGreaterThan(afterScheduled);
    bridge.stop();
  });
});
