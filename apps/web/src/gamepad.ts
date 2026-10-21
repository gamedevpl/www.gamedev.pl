import { useEffect, useRef, type MutableRefObject } from 'react';
import { bindGameFrameReply, isFromGameFrame } from './frameMessage.js';
import { useFrameDocument } from './frameLifecycle.js';

type StandardPad = { index: number; mapping: 'standard'; axes: number[]; buttons: number[] };
type RawPad = Pick<Gamepad, 'id' | 'mapping' | 'axes' | 'buttons'>;

function isMicroPad(pad: Pick<Gamepad, 'id'>): boolean {
  return /^8bitdo micro(?: gamepad)?(?:$|[ (])/i.test(pad.id) || /vendor:\s*2dc8\s+product:\s*9020/i.test(pad.id);
}

/** Layouts we can project onto the standard mapping; unknown raw devices are never guessed. */
export function padLayout(pad: RawPad): 'standard' | 'micro-d-hid' | 'micro-d-mfi' | 'unsupported' {
  if (pad.mapping === 'standard') return 'standard';
  if (!isMicroPad(pad)) return 'unsupported';
  if (pad.axes.length === 10 && pad.buttons.length === 16) return 'micro-d-hid';
  // macOS may expose the same Micro through its GameController/MFi profile.
  if (pad.axes.length === 0 && pad.buttons.length === 15) return 'micro-d-mfi';
  return 'unsupported';
}

/** Decodes the raw HID hat before clamping; its released value lies outside [-1, 1]. */
export function microHat(value: number): number[] {
  if (!Number.isFinite(value) || value < -1.01 || value > 1.01) return [];
  const step = (value + 1) * 3.5;
  const n = Math.round(step);
  if (Math.abs(step - n) > 0.08 || n < 0 || n > 7) return [];
  return [[12], [12, 15], [15], [13, 15], [13], [13, 14], [14], [12, 14]][n];
}

// Standard slot -> raw Micro button (-1 = absent); faces follow physical bottom/right/left/top.
const MICRO_ORDER = {
  'micro-d-hid': [1, 0, 4, 3, 6, 7, 8, 9, 10, 11, 13, 14, -1, -1, -1, -1, 12],
  'micro-d-mfi': [0, 1, 5, 6, 11, 13, 12, 14, 4, 3, -1, -1, 10, 7, 8, 9, 2],
} as const;

function project(pad: Gamepad): StandardPad | null {
  const layout = padLayout(pad);
  if (layout === 'unsupported') return null;
  const button = (n: number) => {
    const raw = pad.buttons[n];
    if (!raw) return 0;
    const value = Number.isFinite(raw.value) ? Math.max(0, Math.min(1, raw.value)) : 0;
    return raw.pressed ? Math.max(0.5, value) : value;
  };
  if (layout === 'standard') {
    return {
      index: pad.index,
      mapping: 'standard',
      axes: Array.from({ length: 4 }, (_, n) =>
        Number.isFinite(pad.axes[n]) ? Math.max(-1, Math.min(1, pad.axes[n])) : 0,
      ),
      buttons: Array.from({ length: 17 }, (_, n) => button(n)),
    };
  }
  const buttons = MICRO_ORDER[layout].map((n) => (n < 0 ? 0 : button(n)));
  if (layout === 'micro-d-hid') {
    // Chrome on macOS reports the digital cross on axes 0/1; other backends use the hat on axis 9.
    const cross: number[] = [];
    if (pad.axes[0] < -0.5) cross.push(14);
    if (pad.axes[0] > 0.5) cross.push(15);
    if (pad.axes[1] < -0.5) cross.push(12);
    if (pad.axes[1] > 0.5) cross.push(13);
    for (const n of cross.length ? cross : microHat(pad.axes[9])) buttons[n] = 1;
  }
  return { index: pad.index, mapping: 'standard', axes: [0, 0, 0, 0], buttons };
}

export function readGamepads(): StandardPad[] {
  try {
    return Array.from(navigator.getGamepads?.() ?? [])
      .filter((pad): pad is Gamepad => pad !== null && pad.connected)
      .flatMap((pad) => {
        const projected = project(pad);
        return projected ? [projected] : [];
      })
      .slice(0, 16);
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
      // `active: false` marks neutral frames, so the game keeps buttons held across focus changes latched.
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
