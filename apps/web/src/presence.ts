import { useEffect, type MutableRefObject } from 'react';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { beatPresence, fetchPresence, leavePresence, type PresenceSnapshot } from './presenceApi.js';

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

/** Mirrors the API's `PRESENCE_HEARTBEAT_MS`; the server's answer overrides it. */
const DEFAULT_HEARTBEAT_MS = 12_000;
/** Never beat faster than this, whatever a server response claims the cadence is. */
const MIN_HEARTBEAT_MS = 5_000;
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

/**
 * Serves presence for the game running in `frameRef` on the published `slug`.
 *
 * Nothing happens until a game says `presence:hello`, exactly as with saves and worlds,
 * so the bridge being mounted for every published game costs the ones that never ask for
 * a roster precisely nothing.
 */
export function usePresenceBridge(frameRef: MutableRefObject<HTMLIFrameElement | null>, slug: string | undefined) {
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    /** True once a game has asked for a roster — until then this whole effect is inert. */
    let engaged = false;
    /** Newest tile the game reported, or null before it has said anything. */
    let position: { col: number; row: number } | null = null;
    let timer: number | null = null;
    let beating = false;
    let heartbeatMs = DEFAULT_HEARTBEAT_MS;
    /** True once at least one beat has been sent, so `leave` knows there is a slot. */
    let joined = false;

    function postToGame(payload: Record<string, unknown>) {
      if (cancelled) return;
      // The frame is sandboxed to an opaque origin, so '*' is the only possible target;
      // the game in turn only accepts messages whose source is its parent.
      frameRef.current?.contentWindow?.postMessage({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload }, '*');
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
      // One beat at a time. A slow request must not let the next tick start a second,
      // or a struggling connection turns into a pile-up aimed at the same endpoint.
      if (beating || cancelled) return;
      beating = true;
      try {
        const snapshot = await beatPresence(slug!, position);
        if (snapshot) {
          joined = joined || snapshot.visible;
          // The server names the cadence, so the two halves cannot drift into disagreeing
          // about how many missed beats a TTL is worth. Floored, so a bad or hostile
          // answer cannot turn this into a tight loop.
          heartbeatMs = Math.max(MIN_HEARTBEAT_MS, snapshot.heartbeatMs || DEFAULT_HEARTBEAT_MS);
        }
        announce(snapshot);
      } catch {
        // A beat that failed is "no presence" as far as the game is concerned, and the
        // next beat is one interval away by construction — which is why, unlike the save
        // and world bridges, there is no retry ladder here to get wrong.
        announce(null);
      } finally {
        beating = false;
      }
    }

    /**
     * Chained rather than an interval, the same reasoning `commons` polling uses: each
     * beat is scheduled only once the previous one has been asked for, so a slow server
     * can never accumulate a queue of requests that all land at once.
     */
    function schedule() {
      if (timer !== null || cancelled || !engaged) return;
      timer = window.setTimeout(() => {
        timer = null;
        // Never beat for a tab nobody is looking at: somebody who alt-tabbed is not in
        // the world in any sense a player would recognise. The visibility listener beats
        // immediately when they come back.
        if (document.visibilityState !== 'hidden') void beat();
        schedule();
      }, heartbeatMs);
    }

    function stop() {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
    }

    async function onMessage(event: MessageEvent) {
      // Pin to this theater's frame: any other window posting `gdp` traffic is not the
      // game we are serving, and must not appear in or read this roster.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const message = parsePresenceMessage(event.data);
      if (!message) return;

      if (message.t === 'presence:hello') {
        engaged = true;
        // The opening answer is a *read*, not a beat. A signed-out visitor gets the count
        // this way, and a signed-in one does not enter the roster until the game has had
        // a chance to say where it is — which stops everybody who opens a world game
        // appearing for one poll at the origin tile.
        try {
          announce(await fetchPresence(slug!));
        } catch {
          announce(null);
        }
        schedule();
        return;
      }

      if (message.t === 'presence:here') {
        position = { col: message.col, row: message.row };
        // Only for a game that actually opened a roster. Without this, a game that never
        // said hello — or one that has already walked away — could still put this side
        // on the network by posting a position, which is exactly the control the shell
        // owns the clock in order to keep.
        if (!engaged) return;
        // The first position is worth a beat straight away: waiting a full interval would
        // leave a player invisible for twelve seconds after walking in, which is most of
        // the time anybody spends deciding whether a world feels inhabited.
        if (!joined) void beat();
        return;
      }

      // presence:away — the game has walked out of its world. Stop beating and withdraw
      // now rather than letting the slot expire, so nobody is drawn standing where
      // somebody used to be.
      stop();
      engaged = false;
      position = null;
      if (joined) {
        joined = false;
        void leavePresence(slug!);
      }
      announce(null);
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        stop();
        return;
      }
      if (!engaged) return;
      // Back from a hidden tab: beat immediately rather than waiting out an interval, so
      // the player rejoins the world at roughly the moment they look at it again.
      void beat();
      schedule();
    }

    window.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      stop();
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisibility);
      // Exiting the player is the most common way a session ends. Withdrawing here is
      // what keeps the count honest: without it every other player in the world spends
      // the rest of the TTL looking at somebody who has closed the tab.
      if (joined) void leavePresence(slug);
    };
  }, [frameRef, slug]);
}
