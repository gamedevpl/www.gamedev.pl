import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { tiltFromOrientation } from './useDeviceTilt.js';

/**
 * The shell half of device sensing (games-repo docs/camera-ar-platform.md, Phase 0: tilt).
 *
 * The same arrangement as the save, world and presence bridges — the sandboxed game
 * cannot reach the device's sensors (the iframe has no `allow=` and never will; see
 * GameFrame.sandbox.test.ts), so this ordinary app code on the real origin reads
 * `deviceorientation` and relays a normalized `{ x, y }` stick over postMessage. Two
 * properties are the point:
 *
 * - **The shell owns the permission.** iOS gates orientation events behind
 *   `DeviceOrientationEvent.requestPermission()`, which must be called from a real user
 *   gesture on the shell's own chrome — a relayed tap inside the iframe does not count.
 *   The theater renders the request button; `request()` here must stay inside the
 *   gesture's task, exactly like useDeviceTilt's.
 * - **The shell owns the rate.** Readings fire at display rate; the relay forwards at
 *   most one frame per RELAY_MS and only when the stick actually moved. A game cannot
 *   ask for more, and raw readings never leave the browser — not to the game (which
 *   gets the clamped stick), and not to any API (there is no sensor telemetry, by
 *   design; the games-repo module reports a single derived `tilt-active` landmark
 *   through the ordinary play-signals funnel instead).
 *
 * Nothing happens until a game says `sensing:hello`, so this bridge being mounted for
 * every published game costs the ones that never ask precisely nothing — the same
 * derive-from-behavior rule the save and world bridges follow.
 */

/** Forward at most one tilt frame per this many ms. Games decay the stick after ~1.2s. */
const RELAY_MS = 50;
/** Movement below this since the last relayed frame is hand tremor, not intent. */
const RELAY_THRESHOLD = 0.01;
/** Readings smaller than this read as level, matching the game module's own deadzone. */
const DEADZONE = 0.06;

type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState | 'granted' | 'denied'>;
};

function orientationCtor(): OrientationConstructor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { DeviceOrientationEvent?: OrientationConstructor }).DeviceOrientationEvent;
  return ctor ?? null;
}

export type SensingHello = { t: 'sensing:hello'; features: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Narrows one message out of the game frame. Returns null for anything else. */
export function parseSensingMessage(raw: unknown): SensingHello | null {
  if (!isObject(raw) || raw.ns !== BRIDGE_NAMESPACE || raw.v !== PROTOCOL_VERSION) return null;
  if (raw.t !== 'sensing:hello') return null;
  const features = Array.isArray(raw.features) ? raw.features.filter((f): f is string => typeof f === 'string') : [];
  return { t: 'sensing:hello', features };
}

export type SensingBridge = {
  /** A game in the frame has asked for tilt. Until then, render nothing. */
  engaged: boolean;
  /** The browser exposes orientation events at all (false on most desktops). */
  supported: boolean;
  /** iOS: a gesture-initiated `request()` is still required before readings flow. */
  needsPermission: boolean;
  /** Readings are arriving and being relayed. */
  active: boolean;
  /** Safe to call unconditionally; only meaningful inside a user gesture on iOS. */
  request: () => void;
};

/**
 * Serves device tilt to the game running in `frameRef`. Mount once per theater; the
 * effect is inert until a game says hello, and detaches every listener on unmount.
 */
export function useSensingBridge(frameRef: MutableRefObject<HTMLIFrameElement | null>): SensingBridge {
  const [engaged, setEngaged] = useState(false);
  const [supported, setSupported] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [granted, setGranted] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const ctor = orientationCtor();
    setSupported(Boolean(ctor));
    // Only iOS defines requestPermission; everywhere else the events just flow.
    setNeedsPermission(Boolean(ctor && typeof ctor.requestPermission === 'function'));
  }, []);

  const request = useCallback(() => {
    const ctor = orientationCtor();
    if (!ctor || typeof ctor.requestPermission !== 'function') return;
    // Must stay inside the gesture's task — no awaiting anything first.
    ctor
      .requestPermission()
      .then((result) => {
        if (result === 'granted') {
          setGranted(true);
          setNeedsPermission(false);
        }
      })
      // A denial is a normal outcome, not an error to surface — the game simply keeps
      // playing on keys, which it must be able to do anyway.
      .catch(() => undefined);
  }, []);

  const listening = engaged && supported && (granted || !needsPermission);

  // Refs, not state: readings arrive at display rate and must not render the theater.
  const baseline = useRef<{ beta: number; gamma: number } | null>(null);
  const lastSent = useRef<{ x: number; y: number; at: number }>({ x: 0, y: 0, at: 0 });
  const announcedActive = useRef(false);

  useEffect(() => {
    function postToGame(payload: Record<string, unknown>) {
      // The frame is sandboxed to an opaque origin, so '*' is the only possible target;
      // the game in turn only accepts messages whose source is its parent.
      frameRef.current?.contentWindow?.postMessage({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload }, '*');
    }

    function onMessage(event: MessageEvent) {
      // Pin to this theater's frame: any other window posting `gdp` traffic is not the
      // game we are serving.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const message = parseSensingMessage(event.data);
      if (!message || !message.features.includes('tilt')) return;
      setEngaged(true);
      // A reloaded or restarted game says hello again; tell it where things stand so it
      // does not sit out its handshake timeout when the sensor is already flowing.
      postToGame({ t: 'sensing:state', active: announcedActive.current });
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frameRef]);

  useEffect(() => {
    if (!listening) return;

    function postToGame(payload: Record<string, unknown>) {
      frameRef.current?.contentWindow?.postMessage({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload }, '*');
    }

    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta == null && event.gamma == null) return;
      // People do not hold phones flat: the first reading defines "level", so play is
      // relative to a comfortable grip (same rule as useDeviceTilt, and for phones the
      // same reason — absolute angles would pin the stick before anybody tilted).
      if (!baseline.current) {
        baseline.current = { beta: event.beta ?? 0, gamma: event.gamma ?? 0 };
        return;
      }
      // A hidden tab must not steer: the theater pauses the game, and a stream of tilt
      // frames on resume would replay a pocketed phone's wobble into the round.
      if (document.visibilityState === 'hidden') return;

      const tilt = tiltFromOrientation(event, baseline.current);
      const x = Math.abs(tilt.x) < DEADZONE ? 0 : tilt.x;
      const y = Math.abs(tilt.y) < DEADZONE ? 0 : tilt.y;

      const now = performance.now();
      const previous = lastSent.current;
      if (now - previous.at < RELAY_MS) return;
      if (Math.abs(x - previous.x) < RELAY_THRESHOLD && Math.abs(y - previous.y) < RELAY_THRESHOLD) return;
      lastSent.current = { x, y, at: now };
      if (!announcedActive.current) {
        announcedActive.current = true;
        setActive(true);
        postToGame({ t: 'sensing:state', active: true });
      }
      postToGame({ t: 'sensing:tilt', x, y });
    };

    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      baseline.current = null;
      lastSent.current = { x: 0, y: 0, at: 0 };
      if (announcedActive.current) {
        announcedActive.current = false;
        setActive(false);
        postToGame({ t: 'sensing:state', active: false });
      }
    };
  }, [listening, frameRef]);

  return { engaged, supported, needsPermission, active, request };
}
