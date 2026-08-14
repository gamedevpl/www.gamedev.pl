import { describe, expect, it, vi } from 'vitest';
import {
  gamepadSpikeEnabled,
  normalizeGamepad,
  startGamepadSpikeRelay,
  type GamepadSpikeFrame,
} from './gamepadSpike.js';

function button(pressed: boolean, value = pressed ? 1 : 0): GamepadButton {
  return { pressed, touched: pressed, value };
}

function gamepad(overrides: Partial<Gamepad> = {}): Gamepad {
  return {
    axes: [0, 0],
    buttons: Array.from({ length: 16 }, () => button(false)),
    connected: true,
    hapticActuators: [],
    id: 'Test pad',
    index: 0,
    mapping: 'standard',
    timestamp: 25,
    vibrationActuator: null,
    ...overrides,
  } as Gamepad;
}

describe('gamepad spike flag', () => {
  it('requires both development mode and the explicit query flag', () => {
    expect(gamepadSpikeEnabled('?gamepad-spike=1', true)).toBe(true);
    expect(gamepadSpikeEnabled('?gamepad-spike=0', true)).toBe(false);
    expect(gamepadSpikeEnabled('?gamepad-spike=1', false)).toBe(false);
  });
});

describe('gamepad normalization', () => {
  it('maps standard buttons and stick axes to the party vocabulary', () => {
    const buttons = Array.from({ length: 16 }, () => button(false));
    buttons[0] = button(true);
    buttons[12] = button(true);
    const normalized = normalizeGamepad(gamepad({ axes: [-0.75, 0.8], buttons }), 1_000);

    expect(normalized.party).toEqual({ up: true, down: true, left: true, right: false, a: true });
    expect(normalized.gamepad).toMatchObject({
      index: 0,
      mapping: 'standard',
      axes: [-0.75, 0.8],
      sourceTimestamp: 1_025,
    });
  });

  it('clamps malformed values and represents a disconnected state', () => {
    expect(normalizeGamepad(null, 0)).toEqual({
      party: { up: false, down: false, left: false, right: false, a: false },
      gamepad: null,
    });

    const normalized = normalizeGamepad(gamepad({ axes: [Infinity, -4], timestamp: 0 }), 100);
    expect(normalized.gamepad?.axes).toEqual([0, -1]);
    expect(normalized.gamepad?.sourceTimestamp).toBeNull();
  });
});

describe('gamepad relay', () => {
  it('polls once per animation frame and stops cleanly', () => {
    const frames: FrameRequestCallback[] = [];
    const sent: GamepadSpikeFrame[] = [];
    const cancelFrame = vi.fn();
    const pad = gamepad();
    let nextHandle = 0;
    const stop = startGamepadSpikeRelay({
      getGamepads: () => [pad],
      requestFrame: (callback) => {
        frames.push(callback);
        nextHandle += 1;
        return nextHandle;
      },
      cancelFrame,
      now: () => 10,
      timeOrigin: 1_000,
      post: (frame) => sent.push(frame),
    });

    expect(sent).toHaveLength(0);
    frames.shift()?.(10);
    expect(sent[0]).toMatchObject({ t: 'gamepad:state', sequence: 0, sampledAt: 1_010 });

    stop();
    expect(cancelFrame).toHaveBeenCalledWith(2);
    frames.shift()?.(20);
    expect(sent).toHaveLength(1);
  });

  it('emits party input edges using the existing controller vocabulary', () => {
    const frames: FrameRequestCallback[] = [];
    const sent: GamepadSpikeFrame[] = [];
    const buttons = Array.from({ length: 16 }, () => button(false));
    const pad = gamepad({ buttons });
    const stop = startGamepadSpikeRelay({
      getGamepads: () => [pad],
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelFrame: vi.fn(),
      now: () => 10,
      timeOrigin: 1_000,
      post: (frame) => sent.push(frame),
    });

    frames.shift()?.(10);
    buttons[0] = button(true);
    frames.shift()?.(20);
    buttons[0] = button(false);
    frames.shift()?.(30);
    stop();

    const partyFrames = sent.filter((frame) => frame.t === 'input');
    expect(partyFrames).toEqual([
      { ns: 'gdp', v: 1, t: 'input', slot: 1, k: 'a', d: 1 },
      { ns: 'gdp', v: 1, t: 'input', slot: 1, k: 'a', d: 0 },
    ]);
  });

  it('reports a disconnected state when browser polling throws', () => {
    const frames: FrameRequestCallback[] = [];
    const sent: GamepadSpikeFrame[] = [];
    const stop = startGamepadSpikeRelay({
      getGamepads: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelFrame: vi.fn(),
      now: () => 10,
      timeOrigin: 1_000,
      post: (frame) => sent.push(frame),
    });

    frames.shift()?.(10);
    stop();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ t: 'gamepad:state', gamepad: null });
  });
});
