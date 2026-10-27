import { useEffect, useRef, type MutableRefObject } from 'react';
import { bindGameFrameReply, isFromGameFrame } from './frameMessage.js';
import { useFrameDocument } from './frameLifecycle.js';

import { readGamepads } from './gamepadRead.js';

export { microHat, padLayout, readGamepads } from './gamepadRead.js';

export function useGamepadBridge(frameRef: MutableRefObject<HTMLIFrameElement | null>, active: boolean): void {
  const epoch = useFrameDocument(frameRef);
  const subscription = useRef({ epoch, requested: false, raw: false });
  useEffect(() => {
    if (subscription.current.epoch !== epoch) subscription.current = { epoch, requested: false, raw: false };
    let requested = subscription.current.requested;
    let raw = subscription.current.raw;
    let running = false;
    let animation = 0;
    let last = '';
    let devices: ReturnType<typeof readGamepads> = [];
    let reply = bindGameFrameReply(frameRef.current);
    function neutral() {
      return devices.map((pad) => ({ ...pad, axes: pad.axes.map(() => 0), buttons: pad.buttons.map(() => 0) }));
    }
    function poll() {
      const inactive = document.visibilityState === 'hidden' || !document.hasFocus();
      if (!inactive) devices = readGamepads(raw);
      const pads = inactive ? neutral() : devices;
      // Marks neutral frames so games latch buttons held across focus changes.
      const serialized = JSON.stringify({ pads, inactive });
      if (serialized !== last) {
        last = serialized;
        reply({ ns: 'gdp', v: 1, t: 'gamepad:state', pads, active: !inactive });
      }
      animation = requestAnimationFrame(poll);
    }
    function onMessage(event: MessageEvent) {
      if (!isFromGameFrame(event, frameRef.current)) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.ns !== 'gdp' || data.v !== 1 || data.t !== 'gamepad:hello') return;
      reply = bindGameFrameReply(frameRef.current);
      last = '';
      subscription.current.requested = true;
      requested = true;
      // Any instance asking for raw devices turns them on for the document.
      if (data.raw === true) subscription.current.raw = raw = true;
      if (!active || running) return;
      running = true;
      poll();
    }
    function release() {
      last = '';
      if (active && requested) reply({ ns: 'gdp', v: 1, t: 'gamepad:state', pads: neutral(), active: false });
    }
    window.addEventListener('message', onMessage);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    if (active && requested) {
      running = true;
      poll();
    }
    return () => {
      cancelAnimationFrame(animation);
      release();
      window.removeEventListener('message', onMessage);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
  }, [frameRef, active, epoch]);
}
