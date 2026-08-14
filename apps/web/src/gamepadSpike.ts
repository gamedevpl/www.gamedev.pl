import { useEffect, type MutableRefObject } from 'react';
import { BRIDGE_NAMESPACE, INPUT_KEYS, PROTOCOL_VERSION, type InputKey } from './mp/protocol.js';

const AXIS_THRESHOLD = 0.5;

export type GamepadPartyState = Record<InputKey, boolean>;

export type GamepadButtonState = {
  pressed: boolean;
  touched: boolean;
  value: number;
};

export type GamepadState = {
  index: number;
  mapping: string;
  axes: number[];
  buttons: GamepadButtonState[];
  sourceTimestamp: number | null;
};

export type GamepadRelayFrame = {
  ns: typeof BRIDGE_NAMESPACE;
  v: typeof PROTOCOL_VERSION;
  t: 'gamepad:state';
  sequence: number;
  sampledAt: number;
  party: GamepadPartyState;
  gamepad: GamepadState | null;
};

export type GamepadPartyFrame = {
  ns: typeof BRIDGE_NAMESPACE;
  v: typeof PROTOCOL_VERSION;
  t: 'input';
  slot: 1;
  k: InputKey;
  d: 0 | 1;
};

export type GamepadSpikeFrame = GamepadRelayFrame | GamepadPartyFrame;

type RelayDependencies = {
  getGamepads: () => readonly (Gamepad | null)[];
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  now: () => number;
  timeOrigin: number;
  post: (frame: GamepadSpikeFrame) => void;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

function pressed(gamepad: Gamepad, index: number): boolean {
  return gamepad.buttons[index]?.pressed === true;
}

function axis(gamepad: Gamepad, index: number): number {
  return clamp(gamepad.axes[index] ?? 0, -1, 1);
}

function partyState(gamepad: Gamepad | null): GamepadPartyState {
  const state = Object.fromEntries(INPUT_KEYS.map((key) => [key, false])) as GamepadPartyState;
  if (!gamepad) return state;

  const horizontal = axis(gamepad, 0);
  const vertical = axis(gamepad, 1);
  state.up = pressed(gamepad, 12) || vertical <= -AXIS_THRESHOLD;
  state.down = pressed(gamepad, 13) || vertical >= AXIS_THRESHOLD;
  state.left = pressed(gamepad, 14) || horizontal <= -AXIS_THRESHOLD;
  state.right = pressed(gamepad, 15) || horizontal >= AXIS_THRESHOLD;
  state.a = pressed(gamepad, 0);
  return state;
}

export function normalizeGamepad(
  gamepad: Gamepad | null,
  timeOrigin: number,
): Pick<GamepadRelayFrame, 'party' | 'gamepad'> {
  if (!gamepad) return { party: partyState(null), gamepad: null };

  return {
    party: partyState(gamepad),
    gamepad: {
      index: gamepad.index,
      mapping: gamepad.mapping,
      axes: Array.from(gamepad.axes, (value) => clamp(value, -1, 1)),
      buttons: Array.from(gamepad.buttons, (button) => ({
        pressed: button.pressed,
        touched: button.touched === true,
        value: clamp(button.value, 0, 1),
      })),
      sourceTimestamp: gamepad.timestamp > 0 ? timeOrigin + gamepad.timestamp : null,
    },
  };
}

export function gamepadSpikeEnabled(search: string, development: boolean): boolean {
  return development && new URLSearchParams(search).get('gamepad-spike') === '1';
}

export function startGamepadSpikeRelay(dependencies: RelayDependencies): () => void {
  let active = true;
  let handle = 0;
  let sequence = 0;
  let previousParty = partyState(null);

  const poll = () => {
    if (!active) return;
    let gamepad: Gamepad | null = null;
    try {
      gamepad = Array.from(dependencies.getGamepads()).find((candidate) => candidate?.connected) ?? null;
    } catch {
      gamepad = null;
    }
    const sampledAt = dependencies.timeOrigin + dependencies.now();
    const normalized = normalizeGamepad(gamepad, dependencies.timeOrigin);
    for (const key of INPUT_KEYS) {
      if (normalized.party[key] === previousParty[key]) continue;
      dependencies.post({
        ns: BRIDGE_NAMESPACE,
        v: PROTOCOL_VERSION,
        t: 'input',
        slot: 1,
        k: key,
        d: normalized.party[key] ? 1 : 0,
      });
    }
    previousParty = normalized.party;
    dependencies.post({
      ns: BRIDGE_NAMESPACE,
      v: PROTOCOL_VERSION,
      t: 'gamepad:state',
      sequence,
      sampledAt,
      ...normalized,
    });
    sequence += 1;
    handle = dependencies.requestFrame(poll);
  };

  handle = dependencies.requestFrame(poll);
  return () => {
    active = false;
    dependencies.cancelFrame(handle);
  };
}

export function useGamepadSpike(frameRef: MutableRefObject<HTMLIFrameElement | null>): void {
  useEffect(() => {
    if (!gamepadSpikeEnabled(window.location.search, import.meta.env.DEV)) return;
    if (typeof navigator.getGamepads !== 'function') return;

    return startGamepadSpikeRelay({
      getGamepads: () => navigator.getGamepads(),
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (handle) => cancelAnimationFrame(handle),
      now: () => performance.now(),
      timeOrigin: Number.isFinite(performance.timeOrigin) ? performance.timeOrigin : Date.now() - performance.now(),
      post: (frame) => frameRef.current?.contentWindow?.postMessage(frame, '*'),
    });
  }, [frameRef]);
}
