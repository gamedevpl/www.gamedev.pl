import { useEffect, type MutableRefObject } from 'react';
import * as cadence from './presence-cadence.js';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { fetchPresence, type PresenceSnapshot } from './presenceApi.js';
import { beatPresence, leavePresence } from './presence-mutations.js';
import { useFrameDocument } from './frameLifecycle.js';
import { isFromGameFrame, postToGameFrame } from './frameMessage.js';

/**
 * The shell half of ambient co-presence (docs/persistent-world-plan.md P2.5).
 *
 * The same arrangement as the save and world bridges — the game cannot reach the network,
 * so it postMessages here and this code, ordinary app code on the real origin holding the
 * session cookie, makes the call. What is genuinely new is that **this side owns the
 * clock**.
 *
 * Saves and world writes are driven by the player doing something. Presence is driven by
 * time, and that is the whole reason the timer lives here rather than in the module: a
 * periodic request whose interval was chosen by untrusted code inside a sandboxed iframe
 * is a denial-of-service surface with a friendly name. The game says *where it is*; the
 * shell decides *how often anybody hears about it*. A game that calls `here()` sixty
 * times a second and one that calls it twice produce exactly the same request rate.
 *
 * Two more consequences of owning the clock, both of which the module could not have
 * arranged for itself:
 *
 * - **A hidden tab stops beating entirely.** Somebody who alt-tabbed is not in the world
 *   in any sense a player would recognise, and continuing to report them would make the
 *   count mean "has this game open" rather than "is here". It also means a backgrounded
 *   game costs the platform nothing, the same standard `commons` polling holds itself to.
 * - **Leaving withdraws immediately.** A slot expires on its own, but the gap between
 *   closing a game and expiring is the whole TTL, and for all of it every other player is
 *   looking at somebody who is not there.
 */

/** Position bound. The server clamps to the game's declared grid; this only stops a
 *  runaway value from becoming a request body at all. */
const MAX_COORDINATE = 4096;

export type PresenceRequest =
  { t: 'presence:hello' } | { t: 'presence:here'; col: number; row: number } | { t: 'presence:away' };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
}

/**
 * The declared space is tiles, so a fractional report plainly means the tile it falls in
 * — truncating is friendlier than rejecting, which would only teach authors to round
 * before every call. `|| 0` is not redundant: `Math.trunc(-0.5)` is `-0`, which survives
 * a structured clone and compares unequal to `0` under `Object.is`.
 */
function toTile(value: number): number {
  return Math.trunc(value) || 0;
}

/** Narrows one message out of the game frame. Returns null for anything else. */
export function parsePresenceMessage(raw: unknown): PresenceRequest | null {
  if (!isObject(raw) || raw.ns !== BRIDGE_NAMESPACE || raw.v !== PROTOCOL_VERSION) return null;
  if (raw.t === 'presence:hello') return { t: 'presence:hello' };
  if (raw.t === 'presence:away') return { t: 'presence:away' };
  if (raw.t === 'presence:here') {
    if (!isCoordinate(raw.col) || !isCoordinate(raw.row)) return null;
    return { t: 'presence:here', col: toTile(raw.col), row: toTile(raw.row) };
  }
  return null;
}

export function usePresenceBridge(frameRef: MutableRefObject<HTMLIFrameElement | null>, slug: string | undefined) {
  const frameDocument = useFrameDocument(frameRef);
  useEffect(() => {
    if (!slug) return;
    let cancelled = false,
      generation = 0;
    /** True once a game has asked for a roster — until then this whole effect is inert. */
    let engaged = false;
    /** Newest tile the game reported, or null before it has said anything. */
    let position: { col: number; row: number } | null = null;
    let timer: number | null = null;
    let beating = false;
    let lease: string | undefined,
      attempted = false;
    const budget = cadence.createPresenceCadence(() => {
      if (engaged && position) void beat();
    });
    let heartbeatMs = cadence.HEARTBEAT_MS;
    /** True once at least one beat has been sent, so `leave` knows there is a slot. */
    let joined = false;
    let helloAt = -Infinity;
    let awaitingFirstHere = false;
    let helloTimer: number | null = null;
    function postToGame(payload: Record<string, unknown>) {
      if (cancelled) return;
      postToGameFrame(frameRef.current, { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload });
    }
    function announce(snapshot: PresenceSnapshot | null) {
      postToGame(
        snapshot
          ? {
              t: 'presence:state',
              available: true,
              visible: snapshot.visible,
              count: snapshot.count,
              peers: snapshot.peers,
              ttlMs: snapshot.ttlMs,
            }
          : { t: 'presence:state', available: false },
      );
    }
    async function beat() {
      if (beating || cancelled || !engaged || !budget.allow(Date.now())) return;
      beating = true;
      const acquired = generation,
        acquiredLease = lease;
      attempted = true;
      if (position) awaitingFirstHere = false;
      try {
        const snapshot = await beatPresence(
          slug!,
          position,
          () => !cancelled && acquired === generation,
          acquiredLease,
        );
        if (cancelled || acquired !== generation) return;
        if (snapshot) {
          joined = joined || snapshot.visible;
          heartbeatMs = Math.max(cadence.MIN_BEAT_MS, snapshot.heartbeatMs || cadence.HEARTBEAT_MS);
        }
        if (!snapshot?.visible) budget.failed(Date.now());
        announce(snapshot);
      } catch {
        if (cancelled || acquired !== generation) return;
        budget.failed(Date.now());
        announce(null);
      } finally {
        beating = false;
        if (engaged && awaitingFirstHere && position) void beat();
      }
    }

    function schedule() {
      if (timer !== null || cancelled || !engaged) return;
      timer = window.setTimeout(() => {
        timer = null;
        if (document.visibilityState !== 'hidden') void beat();
        schedule();
      }, heartbeatMs);
    }

    function stop() {
      budget.stop();
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
    }

    async function openingRead() {
      helloTimer = null;
      helloAt = Date.now();
      awaitingFirstHere = true;
      try {
        announce(await fetchPresence(slug!));
      } catch {
        announce(null);
      }
      if (engaged && awaitingFirstHere && position) void beat();
      schedule();
    }

    async function onMessage(event: MessageEvent) {
      if (!isFromGameFrame(event, frameRef.current)) return;
      const message = parsePresenceMessage(event.data);
      if (!message) return;
      if (message.t === 'presence:hello') {
        if (!engaged) lease = crypto.randomUUID();
        engaged = true;
        position = null;
        const wait = helloAt + cadence.HELLO_INTERVAL_MS - Date.now();
        if (wait > 0) helloTimer ??= window.setTimeout(() => void openingRead(), wait);
        else await openingRead();
        return;
      }

      if (message.t === 'presence:here') {
        position = { col: message.col, row: message.row };
        if (!engaged) return;
        if (!joined || awaitingFirstHere) void beat();
        return;
      }

      stop();
      if (helloTimer !== null) window.clearTimeout(helloTimer);
      helloTimer = null;
      engaged = false;
      generation++;
      position = null;
      if (joined || attempted) {
        attempted = false;
        joined = false;
        void leavePresence(slug!, lease);
      }
      announce(null);
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        stop();
        return;
      }
      if (!engaged) return;
      void beat();
      schedule();
    }

    window.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      generation++;
      stop();
      if (helloTimer !== null) window.clearTimeout(helloTimer);
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisibility);
      if (joined || attempted) void leavePresence(slug, lease);
    };
  }, [frameRef, slug, frameDocument]);
}
