// Framework-free pad reading, shared by the site player and the CLI preview.
export type StandardPad = { index: number; mapping: 'standard'; axes: number[]; buttons: number[] };
// Non-standard devices, only for games that ask for them.
type RawFramePad = { index: number; mapping: ''; axes: number[]; buttons: number[] };
export type FramePad = StandardPad | RawFramePad;
type RawPad = Pick<Gamepad, 'id' | 'mapping' | 'axes' | 'buttons'>;

function isMicroPad(pad: Pick<Gamepad, 'id'>): boolean {
  return /^8bitdo micro(?: gamepad)?(?:$|[ (])/i.test(pad.id) || /vendor:\s*2dc8\s+product:\s*9020/i.test(pad.id);
}

// Unknown raw layouts are refused, never guessed.
export function padLayout(pad: RawPad): 'standard' | 'micro-d-hid' | 'micro-d-mfi' | 'unsupported' {
  if (pad.mapping === 'standard') return 'standard';
  if (!isMicroPad(pad)) return 'unsupported';
  if (pad.axes.length === 10 && pad.buttons.length === 16) return 'micro-d-hid';
  // macOS exposes the same Micro through its MFi profile.
  if (pad.axes.length === 0 && pad.buttons.length === 15) return 'micro-d-mfi';
  return 'unsupported';
}

// Decode before clamping: the released hat value lies outside [-1, 1].
export function microHat(value: number): number[] {
  if (!Number.isFinite(value) || value < -1.01 || value > 1.01) return [];
  const step = (value + 1) * 3.5;
  const n = Math.round(step);
  if (Math.abs(step - n) > 0.08 || n < 0 || n > 7) return [];
  return [[12], [12, 15], [15], [13, 15], [13], [13, 14], [14], [12, 14]][n];
}

// Standard slot to raw Micro button, by physical face position.
const MICRO_ORDER = {
  'micro-d-hid': [1, 0, 4, 3, 6, 7, 8, 9, 10, 11, 13, 14, -1, -1, -1, -1, 12],
  'micro-d-mfi': [0, 1, 5, 6, 11, 13, 12, 14, 4, 3, -1, -1, 10, 7, 8, 9, 2],
} as const;

function project(pad: Gamepad, raw = false): FramePad | null {
  const layout = padLayout(pad);
  const button = (n: number) => {
    const raw = pad.buttons[n];
    if (!raw) return 0;
    const value = Number.isFinite(raw.value) ? Math.max(0, Math.min(1, raw.value)) : 0;
    return raw.pressed ? Math.max(0.5, value) : value;
  };
  if (layout === 'unsupported') {
    if (!raw) return null;
    // Own axis and button order; the game lets the player bind them.
    return {
      index: pad.index,
      mapping: '',
      axes: Array.from({ length: Math.min(8, pad.axes.length) }, (_, n) =>
        Number.isFinite(pad.axes[n]) ? Math.max(-1, Math.min(1, pad.axes[n])) : 0,
      ),
      buttons: Array.from({ length: Math.min(32, pad.buttons.length) }, (_, n) => button(n)),
    };
  }
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
    // macOS Chrome puts the cross on axes; others use the hat.
    const cross: number[] = [];
    if (pad.axes[0] < -0.5) cross.push(14);
    if (pad.axes[0] > 0.5) cross.push(15);
    if (pad.axes[1] < -0.5) cross.push(12);
    if (pad.axes[1] > 0.5) cross.push(13);
    for (const n of cross.length ? cross : microHat(pad.axes[9])) buttons[n] = 1;
  }
  return { index: pad.index, mapping: 'standard', axes: [0, 0, 0, 0], buttons };
}

export function readGamepads(raw = false): FramePad[] {
  try {
    return Array.from(navigator.getGamepads?.() ?? [])
      .filter((pad): pad is Gamepad => pad !== null && pad.connected)
      .flatMap((pad) => {
        const projected = project(pad, raw);
        return projected ? [projected] : [];
      })
      .slice(0, 16);
  } catch {
    return [];
  }
}
