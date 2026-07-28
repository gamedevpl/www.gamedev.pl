import { useEffect, useRef, type MutableRefObject } from 'react';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { deleteGameSave, fetchGameSave, putGameSave } from './gameSaveApi.js';

/**
 * The shell half of durable per-player progress (docs/persistent-world-plan.md P1).
 *
 * A game cannot reach the network — it runs in an opaque-origin iframe whose CSP has no
 * `connect-src` — so the arrangement is the same one multiplayer uses: the game's
 * GameKit `save` module posts a request over the bridge, and this code, which is
 * ordinary app code on the real origin holding the session cookie, makes the call.
 *
 * The bridge is turned on for **every** published game rather than only for games the
 * catalog flags as saving. Nothing happens until a game announces itself with
 * `save:hello`, and only a game that selected the module ever does — so the capability
 * is derived from what the game actually does, not from a declaration that could have
 * drifted from it. That is the same reasoning behind deriving touch support from source.
 *
 * Everything arriving from the frame is hostile input: types are checked, the payload is
 * size-capped before it is ever forwarded, and nothing from the game is rendered,
 * evaluated, or sent anywhere except this one API for this one slug.
 */

/** Mirrors MAX_GAME_SAVE_BYTES in the API. Checked here so a runaway game is stopped at
 *  the bridge rather than being handed to the network to reject. */
const MAX_SAVE_BYTES = 32 * 1024;

export type SaveRequest =
  { t: 'save:hello'; version: number } | { t: 'save:put'; data: string; version: number } | { t: 'save:clear' };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toVersion(value: unknown): number {
  const version = typeof value === 'number' ? Math.trunc(value) : NaN;
  return Number.isFinite(version) && version >= 0 && version <= 1_000_000 ? version : 1;
}

/** Narrows one message out of the game frame. Returns null for anything else. */
export function parseGameSaveMessage(raw: unknown): SaveRequest | null {
  if (!isObject(raw) || raw.ns !== BRIDGE_NAMESPACE || raw.v !== PROTOCOL_VERSION) return null;
  if (raw.t === 'save:hello') return { t: 'save:hello', version: toVersion(raw.version) };
  if (raw.t === 'save:put') {
    // A game that posts a non-string, or something enormous, is buggy or hostile. Drop
    // it here: forwarding would spend a request to be told what we already know.
    if (typeof raw.data !== 'string' || raw.data.length === 0) return null;
    if (new Blob([raw.data]).size > MAX_SAVE_BYTES) return null;
    return { t: 'save:put', data: raw.data, version: toVersion(raw.version) };
  }
  if (raw.t === 'save:clear') return { t: 'save:clear' };
  return null;
}

/**
 * Serves save requests from the game running in `frameRef` for the published `slug`.
 *
 * Writes are serialized: at most one request is in flight, and while it is, only the
 * newest queued value survives. Without that, the module's own coalescing could still
 * race two writes past each other on a slow connection and land the older one last —
 * which is the one failure mode of a save system nobody forgives.
 */
export function useGameSaveBridge(frameRef: MutableRefObject<HTMLIFrameElement | null>, slug: string | undefined) {
  // Held in a ref so the effect below stays keyed on the slug alone; a queued write must
  // survive re-renders, and re-subscribing on every render would drop it.
  const pendingRef = useRef<{ data: string; version: number } | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    let writing = false;
    let currentVersion = 1;

    function postToGame(payload: Record<string, unknown>) {
      // The frame is sandboxed to an opaque origin, so '*' is the only possible target;
      // the game in turn only accepts messages whose source is its parent.
      frameRef.current?.contentWindow?.postMessage({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload }, '*');
    }

    async function drainWrites() {
      if (writing) return;
      writing = true;
      try {
        while (pendingRef.current && !cancelled) {
          const next = pendingRef.current;
          pendingRef.current = null;
          try {
            await putGameSave(slug!, next.data, next.version);
            postToGame({ t: 'save:ack', ok: true });
          } catch (error) {
            // Reported, never thrown at the game: a failed save must not be able to
            // break a round that is otherwise going fine. The module surfaces it as
            // `save.lastError` for an author to notice.
            postToGame({ t: 'save:ack', ok: false, error: error instanceof Error ? error.message : 'save failed' });
          }
        }
      } finally {
        writing = false;
      }
    }

    async function onMessage(event: MessageEvent) {
      // Pin to this theater's frame: any other window posting `gdp` traffic is not the
      // game we are serving, and must not read or write this player's save.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const message = parseGameSaveMessage(event.data);
      if (!message) return;

      if (message.t === 'save:hello') {
        currentVersion = message.version;
        try {
          const save = await fetchGameSave(slug!);
          if (cancelled) return;
          // null means no slot exists — signed out, or not a published game. The module
          // treats that as "unavailable" and the game plays on without saving.
          postToGame(
            save
              ? { t: 'save:state', available: true, data: save.data, version: save.version }
              : { t: 'save:state', available: false },
          );
        } catch {
          // A read that failed for any other reason is also "no slot" as far as the
          // game is concerned. Guessing optimistically here would let it write over a
          // save we simply could not read.
          if (!cancelled) postToGame({ t: 'save:state', available: false });
        }
        return;
      }

      if (message.t === 'save:put') {
        pendingRef.current = { data: message.data, version: message.version || currentVersion };
        void drainWrites();
        return;
      }

      if (message.t === 'save:clear') {
        pendingRef.current = null;
        try {
          await deleteGameSave(slug!);
          if (!cancelled) postToGame({ t: 'save:ack', ok: true });
        } catch {
          if (!cancelled) postToGame({ t: 'save:ack', ok: false, error: 'clear failed' });
        }
      }
    }

    window.addEventListener('message', onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      // Exiting the player is the most common way a session ends, and the module's own
      // flush on `pagehide` has just handed us the last value. Send it: `keepalive` on
      // the request means it completes even though this component is going away.
      const last = pendingRef.current;
      pendingRef.current = null;
      if (last) void putGameSave(slug, last.data, last.version).catch(() => undefined);
    };
  }, [frameRef, slug]);
}
