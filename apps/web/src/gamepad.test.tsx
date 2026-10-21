// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { microHat, padLayout, readGamepads, useGamepadBridge } from './gamepad.js';
import { documentMessage } from './test-utils/frameMessage.js';
import { markGameFrameNavigatedAway } from './frameMessage.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function pad(index: number): Gamepad {
  return {
    index,
    connected: true,
    mapping: 'standard',
    axes: [0.6, 0, 0, 0],
    buttons: [{ pressed: true, value: 1 }],
    id: 'private device name',
    timestamp: 123,
  } as unknown as Gamepad;
}

function setup(active = true) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const get = vi.fn(() => [pad(2), null, pad(5)]);
  vi.stubGlobal('navigator', { getGamepads: get });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  let next: FrameRequestCallback | null = null;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      next = callback;
      return 1;
    }),
  );
  const cancel = vi.fn(() => {
    next = null;
  });
  vi.stubGlobal('cancelAnimationFrame', cancel);
  function Harness({ active }: { active: boolean }) {
    const ref = useRef<HTMLIFrameElement | null>(null);
    useGamepadBridge(ref, active);
    return <iframe ref={ref} />;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<Harness active={active} />));
  const frame = container.querySelector('iframe')!;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
  const send = (source: Window = frame.contentWindow!) =>
    act(() =>
      window.dispatchEvent(
        documentMessage('message', {
          source,
          origin: 'null',
          data: { ns: 'gdp', v: 1, t: 'gamepad:hello' },
        }),
      ),
    );
  return {
    get,
    frame,
    post,
    send,
    cancel,
    setActive(value: boolean) {
      act(() => root.render(<Harness active={value} />));
    },
    tick() {
      const callback = next;
      next = null;
      act(() => callback?.(0));
    },
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('gamepad bridge', () => {
  it('reads only after the active game asks and transmits bounded controls without identity', () => {
    const host = setup();
    try {
      expect(host.get).not.toHaveBeenCalled();
      host.send();
      expect(host.get).toHaveBeenCalledOnce();
      const data = host.post.mock.calls[0]![0];
      expect(data).toMatchObject({ t: 'gamepad:state', pads: [{ index: 2 }, { index: 5 }] });
      expect(JSON.stringify(data)).not.toContain('private device name');
      expect(data.pads[0]).not.toHaveProperty('timestamp');
      host.tick();
      expect(host.post).toHaveBeenCalledOnce();
      host.get.mockReturnValue([]);
      host.tick();
      expect(host.post).toHaveBeenLastCalledWith(expect.objectContaining({ pads: [] }), '*');
    } finally {
      host.cleanup();
    }
  });

  it('ignores other windows and passive game previews', () => {
    const host = setup();
    try {
      host.send(window);
      expect(host.get).not.toHaveBeenCalled();
    } finally {
      host.cleanup();
    }
    const passive = setup(false);
    try {
      passive.send();
      expect(passive.get).not.toHaveBeenCalled();
    } finally {
      passive.cleanup();
    }
  });

  it('releases controls on focus loss and stops on navigation or unmount', () => {
    const host = setup();
    try {
      host.send();
      expect(host.post).toHaveBeenLastCalledWith(expect.objectContaining({ active: true }), '*');
      act(() => window.dispatchEvent(new Event('blur')));
      expect(host.post).toHaveBeenLastCalledWith(
        expect.objectContaining({
          active: false,
          pads: [
            expect.objectContaining({ index: 2, axes: [0, 0, 0, 0], buttons: Array(17).fill(0) }),
            expect.objectContaining({ index: 5, axes: [0, 0, 0, 0], buttons: Array(17).fill(0) }),
          ],
        }),
        '*',
      );
      const calls = host.post.mock.calls.length;
      act(() => markGameFrameNavigatedAway(host.frame));
      host.tick();
      expect(host.cancel).toHaveBeenCalled();
      expect(host.post).toHaveBeenCalledTimes(calls);
      host.send();
      expect(host.post).toHaveBeenCalledTimes(calls);
    } finally {
      host.cleanup();
    }
  });

  it('resends the current state when another game input consumer subscribes', () => {
    const host = setup();
    try {
      host.send();
      host.send();
      host.tick();
      expect(host.post).toHaveBeenCalledTimes(2);
    } finally {
      host.cleanup();
    }
  });

  it('starts Studio Play after a passive preview subscribed without reloading the game', () => {
    const host = setup(false);
    try {
      host.send();
      expect(host.get).not.toHaveBeenCalled();
      host.setActive(true);
      expect(host.get).toHaveBeenCalledOnce();
      expect(host.post).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pads: [expect.objectContaining({ index: 2 }), expect.objectContaining({ index: 5 })],
        }),
        '*',
      );
      host.setActive(false);
      const count = host.get.mock.calls.length;
      host.tick();
      expect(host.get).toHaveBeenCalledTimes(count);
    } finally {
      host.cleanup();
    }
  });
});

it('handles absent, denied and nonstandard APIs without throwing', () => {
  vi.stubGlobal('navigator', {});
  expect(readGamepads()).toEqual([]);
  vi.stubGlobal('navigator', {
    getGamepads: () => {
      throw new Error('denied');
    },
  });
  expect(readGamepads()).toEqual([]);
  vi.stubGlobal('navigator', {
    getGamepads: () => [
      { ...pad(1), mapping: '' },
      { ...pad(3), connected: false },
    ],
  });
  expect(readGamepads()).toEqual([]);
});

function micro(index: number, pressed: number[] = [], hat = 9 / 7): Gamepad {
  return {
    id: '8BitDo Micro gamepad (Vendor: 2dc8 Product: 9020)',
    index,
    connected: true,
    mapping: '',
    axes: [-1 / 255, -1 / 255, -1 / 255, 0, -1, -1 / 255, 0, 0, 0, hat],
    buttons: Array.from({ length: 16 }, (_, n) => ({
      pressed: pressed.includes(n),
      value: pressed.includes(n) ? 1 : 0,
    })),
  } as unknown as Gamepad;
}

describe('8BitDo Micro projection', () => {
  it('decodes every hat direction and never walks on the released value', () => {
    const expected = [[12], [12, 15], [15], [13, 15], [13], [13, 14], [14], [12, 14]];
    expected.forEach((value, n) => expect(microHat(-1 + (n * 2) / 7)).toEqual(value));
    for (const value of [9 / 7, NaN, Infinity, 0, -2]) expect(microHat(value)).toEqual([]);
  });

  it('projects the D-input layout onto standard slots without identity', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [micro(4)] });
    expect(readGamepads()).toEqual([{ index: 4, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array(17).fill(0) }]);
    // Raw faces map by position; 11 is Start, 7 is R.
    vi.stubGlobal('navigator', { getGamepads: () => [micro(4, [1, 0, 4, 3, 11, 7], -1)] });
    const [pad] = readGamepads();
    expect([0, 1, 2, 3, 9, 5, 12].map((n) => pad.buttons[n])).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(JSON.stringify(pad)).not.toMatch(/Micro|9020/);
  });

  it('reads the digital cross from axes 0/1 when the hat stays neutral', () => {
    const raw = micro(0);
    const right = { ...raw, axes: [1, ...raw.axes.slice(1)] } as unknown as Gamepad;
    vi.stubGlobal('navigator', { getGamepads: () => [right] });
    const [pad] = readGamepads();
    expect(pad.buttons[15]).toBe(1);
    expect(pad.buttons[14]).toBe(0);
  });

  it('handles the MFi variant and refuses unknown raw layouts', () => {
    const mfi = {
      ...micro(3),
      axes: [],
      buttons: Array.from({ length: 15 }, (_, n) => ({
        pressed: [10, 13].includes(n),
        value: [10, 13].includes(n) ? 1 : 0,
      })),
    } as unknown as Gamepad;
    expect(padLayout(mfi)).toBe('micro-d-mfi');
    vi.stubGlobal('navigator', {
      getGamepads: () => [mfi, { ...micro(8), id: 'Unknown raw pad' }, { ...micro(1), axes: [0, 0] }],
    });
    const pads = readGamepads();
    expect(pads.map((pad) => pad.index)).toEqual([3]);
    expect(pads[0].buttons[12]).toBe(1);
    expect(pads[0].buttons[5]).toBe(1);
  });
});
