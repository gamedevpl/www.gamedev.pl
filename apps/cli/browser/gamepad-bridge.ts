import { readGamepads, type FramePad } from '../../web/src/gamepadRead.js';

// Same gamepad bridge as the site player: sandboxed games cannot read pads themselves.
export function startGamepadBridge(): void {
  const subscribers = new Set<Window>();
  let raw = false,
    last = '',
    running = false,
    devices: FramePad[] = [];
  const isChildFrame = (source: unknown) =>
    [...document.querySelectorAll('iframe')].some((frame) => frame.contentWindow && frame.contentWindow === source);
  function poll() {
    const inactive = document.visibilityState === 'hidden' || !document.hasFocus();
    if (!inactive) devices = readGamepads(raw);
    const pads = inactive
      ? devices.map((pad) => ({ ...pad, axes: pad.axes.map(() => 0), buttons: pad.buttons.map(() => 0) }))
      : devices;
    const serialized = JSON.stringify({ pads, inactive });
    if (serialized !== last) {
      last = serialized;
      for (const target of subscribers) {
        // Reloads and candidate swaps replace frames; forget the old windows.
        if (!isChildFrame(target)) subscribers.delete(target);
        else target.postMessage({ ns: 'gdp', v: 1, t: 'gamepad:state', pads, active: !inactive }, '*');
      }
    }
    requestAnimationFrame(poll);
  }
  addEventListener('message', (event) => {
    const data = event.data;
    if (data?.ns !== 'gdp' || data.v !== 1 || data.t !== 'gamepad:hello' || !isChildFrame(event.source)) return;
    subscribers.add(event.source as Window);
    last = '';
    if (data.raw === true) raw = true;
    if (running) return;
    running = true;
    poll();
  });
}
