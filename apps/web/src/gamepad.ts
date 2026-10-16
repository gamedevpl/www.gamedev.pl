import { useEffect, useRef, type MutableRefObject } from 'react';
import { bindGameFrameReply, isFromGameFrame } from './frameMessage.js';
import { useFrameDocument } from './frameLifecycle.js';

export function readGamepads(): { index: number; mapping: 'standard'; axes: number[]; buttons: number[] }[] {
  try {
    return Array.from(navigator.getGamepads?.() ?? [])
      .filter((pad): pad is Gamepad => pad !== null && pad.connected && pad.mapping === 'standard')
      .slice(0, 16)
      .map((pad) => ({
        index: pad.index,
        mapping: 'standard',
        axes: Array.from(pad.axes)
          .slice(0, 4)
          .map((value) => (Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0)),
        buttons: Array.from(pad.buttons)
          .slice(0, 17)
          .map((button) => {
            const value = Number.isFinite(button.value) ? Math.max(0, Math.min(1, button.value)) : 0;
            return button.pressed ? Math.max(0.5, value) : value;
          }),
      }));
  } catch {
    return [];
  }
}

export function useGamepadBridge(frameRef: MutableRefObject<HTMLIFrameElement | null>, active: boolean): void {
  const epoch = useFrameDocument(frameRef);
  const subscription = useRef({ epoch, requested: false });
  useEffect(() => {
    if (subscription.current.epoch !== epoch) subscription.current = { epoch, requested: false };
    let requested = subscription.current.requested;
    let running = false;
    let animation = 0;
    let last = '';
    let devices: ReturnType<typeof readGamepads> = [];
    let reply = bindGameFrameReply(frameRef.current);
    function neutral() {
      return devices.map((pad) => ({ ...pad, axes: [0, 0, 0, 0], buttons: Array<number>(17).fill(0) }));
    }
    function poll() {
      const inactive = document.visibilityState === 'hidden' || !document.hasFocus();
      if (!inactive) devices = readGamepads();
      const pads = inactive ? neutral() : devices;
      const serialized = JSON.stringify(pads);
      if (serialized !== last) {
        last = serialized;
        reply({ ns: 'gdp', v: 1, t: 'gamepad:state', pads });
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
      if (!active || running) return;
      running = true;
      poll();
    }
    function release() {
      last = '';
      if (active && requested) reply({ ns: 'gdp', v: 1, t: 'gamepad:state', pads: neutral() });
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
