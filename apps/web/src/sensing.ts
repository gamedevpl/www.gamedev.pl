import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { tiltFromOrientation } from './useDeviceTilt.js';

/**
 * The shell half of device sensing (games-repo docs/camera-ar-platform.md).
 *
 * Phase 0 — tilt: the sandboxed game cannot reach the device's sensors (the iframe
 * has no `allow=` and never will; see GameFrame.sandbox.test.ts), so this ordinary
 * app code on the real origin reads `deviceorientation` and relays a normalized
 * `{ x, y }` stick over postMessage.
 *
 * Phase 2 — camera backdrop: the shell opens `getUserMedia` on its own origin and
 * composites a `<video>` *under* the iframe. No pixels cross the bridge — only a
 * boolean `backdrop` on `sensing:state`. The game paints a stand-in when false and
 * clears transparent when true. Camera never auto-starts; a theater chrome tap is
 * required every session.
 *
 * Shared properties of both phases:
 *
 * - **The shell owns the permission.** iOS (tilt) and every browser (camera) need a
 *   real user gesture on the shell's own chrome — a relayed tap inside the iframe
 *   does not count.
 * - **Raw readings / frames never leave the browser.** No sensor telemetry; the
 *   games-repo module reports a single derived `tilt-active` / `backdrop-active`
 *   landmark through the ordinary play-signals funnel instead.
 *
 * Nothing happens until a game says `sensing:hello`, so this bridge being mounted for
 * every published game costs the ones that never ask precisely nothing.
 */

/** Forward at most one tilt frame per this many ms. Games decay the stick after ~1.2s. */
const RELAY_MS = 50;
/** Movement below this since the last relayed frame is hand tremor, not intent. */
const RELAY_THRESHOLD = 0.01;
/**
 * A held, unmoving stick is re-sent this often. The movement gate above would otherwise
 * suppress a steady turn forever, and the game module reads a relay silent for ~1.2s as
 * stopped — a player holding a turn would drift back to neutral mid-corner.
 */
const HEARTBEAT_MS = 400;
/** Readings smaller than this read as level, matching the game module's own deadzone. */
const DEADZONE = 0.06;

export type BackdropFacing = 'user' | 'environment';

/**
 * The angle the viewport is rotated from the device's natural orientation. Raw
 * beta/gamma are device-frame; a landscape game steered in device axes gets its x and y
 * swapped, so the relayed vector is rotated into screen space before it leaves.
 */
function screenAngle(): number {
  try {
    const orientation = typeof screen !== 'undefined' ? screen.orientation : undefined;
    if (orientation && typeof orientation.angle === 'number') return orientation.angle;
    const legacy = Number((window as unknown as { orientation?: unknown }).orientation);
    return Number.isFinite(legacy) ? legacy : 0;
  } catch {
    return 0;
  }
}

function rotateIntoScreen(tilt: { x: number; y: number }, angle: number): { x: number; y: number } {
  if (angle === 90) return { x: tilt.y, y: -tilt.x };
  if (angle === -90 || angle === 270) return { x: -tilt.y, y: tilt.x };
  if (angle === 180) return { x: -tilt.x, y: -tilt.y };
  return tilt;
}

type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState | 'granted' | 'denied'>;
};

function orientationCtor(): OrientationConstructor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { DeviceOrientationEvent?: OrientationConstructor }).DeviceOrientationEvent;
  return ctor ?? null;
}

function parseFacing(raw: unknown): BackdropFacing {
  return raw === 'environment' ? 'environment' : 'user';
}

export type SensingHello = {
  t: 'sensing:hello';
  features: string[];
  /** Present when the game asked for backdrop; default `'user'` if omitted. */
  facing: BackdropFacing | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Narrows one message out of the game frame. Returns null for anything else. */
export function parseSensingMessage(raw: unknown): SensingHello | null {
  if (!isObject(raw) || raw.ns !== BRIDGE_NAMESPACE || raw.v !== PROTOCOL_VERSION) return null;
  if (raw.t !== 'sensing:hello') return null;
  const features = Array.isArray(raw.features) ? raw.features.filter((f): f is string => typeof f === 'string') : [];
  const wantsBackdrop = features.includes('backdrop');
  return {
    t: 'sensing:hello',
    features,
    facing: wantsBackdrop ? parseFacing(raw.facing) : null,
  };
}

export type SensingBackdrop = {
  /** A game in the frame has asked for a camera backdrop. */
  engaged: boolean;
  /** The browser exposes `mediaDevices.getUserMedia`. */
  supported: boolean;
  /** A live stream is composited under the iframe. */
  live: boolean;
  /** Facing mode the game declared (`user` mirrored by the theater CSS). */
  facing: BackdropFacing;
  /** The active stream, if any — attach to a muted autoplay `<video playsInline>`. */
  stream: MediaStream | null;
  /** Safe to call unconditionally; only meaningful inside a user gesture. */
  start: () => void;
  stop: () => void;
};

export type SensingBridge = {
  /** A game in the frame has asked for tilt. Until then, render nothing tilt-related. */
  engaged: boolean;
  /** The browser exposes orientation events at all (false on most desktops). */
  supported: boolean;
  /** iOS: a gesture-initiated `request()` is still required before readings flow. */
  needsPermission: boolean;
  /** Tilt readings are arriving and being relayed. */
  active: boolean;
  /** Safe to call unconditionally; only meaningful inside a user gesture on iOS. */
  request: () => void;
  /** Camera-backdrop half; `engaged` is false until a game asks for it. */
  backdrop: SensingBackdrop;
};

function cameraSupported(): boolean {
  try {
    return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  } catch {
    return false;
  }
}

/**
 * Serves device tilt and/or a camera backdrop to the game running in `frameRef`.
 * Mount once per theater; the effect is inert until a game says hello, and detaches
 * every listener / stops every track on unmount.
 */
export function useSensingBridge(frameRef: MutableRefObject<HTMLIFrameElement | null>): SensingBridge {
  const [tiltEngaged, setTiltEngaged] = useState(false);
  const [supported, setSupported] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [granted, setGranted] = useState(false);
  const [active, setActive] = useState(false);

  const [backdropEngaged, setBackdropEngaged] = useState(false);
  const [backdropSupported, setBackdropSupported] = useState(false);
  const [backdropLive, setBackdropLive] = useState(false);
  const [backdropFacing, setBackdropFacing] = useState<BackdropFacing>('user');
  const [backdropStream, setBackdropStream] = useState<MediaStream | null>(null);

  const tiltActiveRef = useRef(false);
  const backdropLiveRef = useRef(false);
  const backdropFacingRef = useRef<BackdropFacing>('user');
  const streamRef = useRef<MediaStream | null>(null);
  /** True while a getUserMedia() call is in flight — blocks double-Start races. */
  const acquiringRef = useRef(false);
  /** Bumped to invalidate an in-flight acquisition (hide / stop / unmount). */
  const acquireGenRef = useRef(0);
  const wantsTiltRef = useRef(false);
  const wantsBackdropRef = useRef(false);

  useEffect(() => {
    const ctor = orientationCtor();
    setSupported(Boolean(ctor));
    // Only iOS defines requestPermission; everywhere else the events just flow.
    setNeedsPermission(Boolean(ctor && typeof ctor.requestPermission === 'function'));
    setBackdropSupported(cameraSupported());
  }, []);

  const postState = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      {
        ns: BRIDGE_NAMESPACE,
        v: PROTOCOL_VERSION,
        t: 'sensing:state',
        active: tiltActiveRef.current,
        backdrop: backdropLiveRef.current,
      },
      '*',
    );
  }, [frameRef]);

  const stopBackdropTracks = useCallback(() => {
    // Invalidate any in-flight getUserMedia so a late resolve cannot resurrect the feed.
    acquireGenRef.current += 1;
    acquiringRef.current = false;
    const stream = streamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
    streamRef.current = null;
    setBackdropStream(null);
    if (backdropLiveRef.current) {
      backdropLiveRef.current = false;
      setBackdropLive(false);
      postState();
    }
  }, [postState]);

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

  const startBackdrop = useCallback(() => {
    if (!wantsBackdropRef.current || !cameraSupported()) return;
    if (streamRef.current || acquiringRef.current) return;
    acquiringRef.current = true;
    const gen = acquireGenRef.current;
    // Must stay inside the gesture's task — getUserMedia is the prompt.
    void navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: backdropFacingRef.current },
          // Prefer a modest stream; the video is cover-fit under the play surface.
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then((stream) => {
        acquiringRef.current = false;
        // Theater closed, feature dropped, tab hidden, or a newer stop invalidated us.
        if (gen !== acquireGenRef.current || !wantsBackdropRef.current || document.visibilityState === 'hidden') {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        setBackdropStream(stream);
        backdropLiveRef.current = true;
        setBackdropLive(true);
        postState();
      })
      // Denied / no camera: the game keeps its stand-in. Do not surface an error.
      .catch(() => {
        acquiringRef.current = false;
      });
  }, [postState]);

  const stopBackdrop = useCallback(() => {
    stopBackdropTracks();
  }, [stopBackdropTracks]);

  const listening = tiltEngaged && supported && (granted || !needsPermission);

  // Refs, not state: readings arrive at display rate and must not render the theater.
  const baseline = useRef<{ beta: number; gamma: number } | null>(null);
  const lastSent = useRef<{ x: number; y: number; at: number }>({ x: 0, y: 0, at: 0 });

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Pin to this theater's frame: any other window posting `gdp` traffic is not the
      // game we are serving.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const message = parseSensingMessage(event.data);
      if (!message) return;

      const wantsTilt = message.features.includes('tilt');
      const wantsBackdrop = message.features.includes('backdrop');
      // Unknown-only hellos are noise before any engagement. Once a game has said
      // hello, a later hello is authoritative — including one that drops tilt/backdrop.
      if (!wantsTilt && !wantsBackdrop && !wantsTiltRef.current && !wantsBackdropRef.current) {
        return;
      }

      wantsTiltRef.current = wantsTilt;
      wantsBackdropRef.current = wantsBackdrop;
      setTiltEngaged(wantsTilt);
      if (wantsBackdrop) {
        const facing = message.facing ?? 'user';
        backdropFacingRef.current = facing;
        setBackdropFacing(facing);
        setBackdropEngaged(true);
      } else {
        setBackdropEngaged(false);
        stopBackdropTracks();
      }
      // A reloaded or restarted game says hello again; tell it where things stand so it
      // does not sit out its handshake timeout when the sensor is already flowing.
      postState();
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frameRef, postState, stopBackdropTracks]);

  // Camera stream must die when the tab hides or the theater unmounts — OS camera
  // indicator and trust both depend on MediaStreamTrack.stop(), not pause().
  useEffect(() => {
    if (!backdropEngaged) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stopBackdropTracks();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopBackdropTracks();
      wantsBackdropRef.current = false;
    };
  }, [backdropEngaged, stopBackdropTracks]);

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

      // Delta in device axes, then rotated into the axes the player is looking at —
      // a landscape game must read "tilt right" as screen-right, not device-right.
      const tilt = rotateIntoScreen(tiltFromOrientation(event, baseline.current), screenAngle());
      const x = Math.abs(tilt.x) < DEADZONE ? 0 : tilt.x;
      const y = Math.abs(tilt.y) < DEADZONE ? 0 : tilt.y;

      const now = performance.now();
      const previous = lastSent.current;
      if (now - previous.at < RELAY_MS) return;
      const moved = Math.abs(x - previous.x) >= RELAY_THRESHOLD || Math.abs(y - previous.y) >= RELAY_THRESHOLD;
      // A steady nonzero stick heartbeats through the movement gate: the game reads a
      // silent relay as stopped, and a held turn must stay held.
      const held = x !== 0 || y !== 0;
      if (!moved && !(held && now - previous.at >= HEARTBEAT_MS)) return;
      lastSent.current = { x, y, at: now };
      if (!tiltActiveRef.current) {
        tiltActiveRef.current = true;
        setActive(true);
        postState();
      }
      postToGame({ t: 'sensing:tilt', x, y });
    };

    // Turning the phone over to the other orientation changes both the axis mapping
    // and the comfortable grip; re-baseline so "level" is re-learned in the new hold.
    const onOrientationChange = () => {
      baseline.current = null;
    };

    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('orientationchange', onOrientationChange);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('orientationchange', onOrientationChange);
      baseline.current = null;
      lastSent.current = { x: 0, y: 0, at: 0 };
      if (tiltActiveRef.current) {
        tiltActiveRef.current = false;
        setActive(false);
        postState();
      }
    };
  }, [listening, frameRef, postState]);

  return {
    engaged: tiltEngaged,
    supported,
    needsPermission,
    active,
    request,
    backdrop: {
      engaged: backdropEngaged,
      supported: backdropSupported,
      live: backdropLive,
      facing: backdropFacing,
      stream: backdropStream,
      start: startBackdrop,
      stop: stopBackdrop,
    },
  };
}
