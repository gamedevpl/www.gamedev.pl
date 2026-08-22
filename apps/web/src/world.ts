import { MAX_WORLD_ENTRY_BYTES, MAX_WORLD_FIELDS, MAX_WORLD_KEY_LENGTH } from '@gamedevpl/contract';
import { useEffect, type MutableRefObject } from 'react';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { deleteWorldEntry, fetchWorld, putWorldEntry } from './worldApi.js';

/**
 * The shell half of shared asynchronous worlds (docs/persistent-world-plan.md P2).
 *
 * Same arrangement as the save bridge: a game cannot reach the network, so its GameKit
 * `commons` module posts a request here and this code — ordinary app code on the real
 * origin, holding the session cookie — makes the call.
 *
 * As with saves, the bridge is live for **every** published game rather than only those
 * the catalog flags. Nothing happens until a game says `commons:hello`, and only a game
 * that selected the module ever does, so the capability is derived from what the game
 * actually does rather than from a declaration that could have drifted from it.
 *
 * What is different here is the blast radius. A save is one person's data; a world entry
 * is shown to everybody who opens the game. So the shell forwards writes but decides
 * nothing about them: the schema, the ownership rule, the quota and the moderation all
 * live on the server, where a modified client cannot reach them. Everything arriving
 * from the frame is checked for type and size before it is forwarded, and nothing from
 * the game is rendered, evaluated, or sent anywhere but this one API for this one slug.
 */

/** Mirrors MAX_WORLD_KEY_LENGTH in the API. */
const MAX_KEY_LENGTH = MAX_WORLD_KEY_LENGTH;
const KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/;
/**
 * Fields the shell will forward. The real check is the game's declared schema, applied
 * server-side; this only stops a runaway payload from becoming a request at all.
 *
 * `MAX_FIELDS_BYTES` mirrors the API's `MAX_WORLD_ENTRY_BYTES`, and mirroring it is the
 * point: a looser bound here would forward writes the server is certain to reject,
 * which is precisely the request this guard exists to save. The server measures the
 * canonical stored value while this measures what the game sent, so the two are not
 * byte-identical — but validation only ever shrinks an entry (unknown fields are
 * refused, text is trimmed), so anything over this was never going to fit.
 */
const MAX_FIELDS = MAX_WORLD_FIELDS;
const MAX_FIELDS_BYTES = MAX_WORLD_ENTRY_BYTES;

export type WorldRequest =
  | { t: 'commons:hello' }
  | { t: 'commons:list' }
  | { t: 'commons:put'; key: string; fields: Record<string, unknown> }
  | { t: 'commons:remove'; key: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isForwardableKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_KEY_LENGTH && KEY_PATTERN.test(value);
}

/** Narrows one message out of the game frame. Returns null for anything else. */
export function parseWorldMessage(raw: unknown): WorldRequest | null {
  if (!isObject(raw) || raw.ns !== BRIDGE_NAMESPACE || raw.v !== PROTOCOL_VERSION) return null;
  if (raw.t === 'commons:hello') return { t: 'commons:hello' };
  if (raw.t === 'commons:list') return { t: 'commons:list' };
  if (raw.t === 'commons:remove') {
    return isForwardableKey(raw.key) ? { t: 'commons:remove', key: raw.key } : null;
  }
  if (raw.t === 'commons:put') {
    if (!isForwardableKey(raw.key) || !isObject(raw.fields)) return null;
    if (Object.keys(raw.fields).length > MAX_FIELDS) return null;
    let encoded: string;
    try {
      encoded = JSON.stringify(raw.fields);
    } catch {
      // Circular, or a value that cannot be serialized. Nothing to forward.
      return null;
    }
    if (new Blob([encoded]).size > MAX_FIELDS_BYTES) return null;
    return { t: 'commons:put', key: raw.key, fields: raw.fields };
  }
  return null;
}

/**
 * Serves world requests from the game running in `frameRef` for the published `slug`.
 *
 * Writes are serialized per key: at most one request per key is in flight, and while it
 * is, only the newest queued value for that key survives. Per key rather than globally,
 * because two keys are two documents — a global queue would make planting two things at
 * once lose one of them, and a global in-flight lock would make a slow write to one plot
 * hold up every other.
 */
export function useWorldBridge(frameRef: MutableRefObject<HTMLIFrameElement | null>, slug: string | undefined) {
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    /**
     * Newest queued value per key, and which keys have a request in flight. Both owned
     * by this effect run: the effect is keyed on the slug, so anything surviving into
     * the next run would be one game's writes aimed at the next game's world.
     */
    const pending = new Map<string, Record<string, unknown> | null>();
    const inFlight = new Set<string>();

    function postToGame(payload: Record<string, unknown>) {
      // Nothing is sent to a frame we have already torn down — but the write itself
      // still completes; see the drain loop.
      if (cancelled) return;
      // The frame is sandboxed to an opaque origin, so '*' is the only possible target;
      // the game in turn only accepts messages whose source is its parent.
      frameRef.current?.contentWindow?.postMessage({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload }, '*');
    }

    async function sendState() {
      try {
        const world = await fetchWorld(slug!);
        if (cancelled) return;
        // null means there is no world here — not published, or the game declares none.
        // The module treats that as unavailable and the game plays on without one.
        postToGame(
          world
            ? {
                t: 'commons:state',
                available: true,
                writable: world.writable,
                max: world.maxPerPlayer,
                entries: world.entries,
              }
            : { t: 'commons:state', available: false, retryable: false },
        );
      } catch {
        // A read that failed is also "no world" as far as the game is concerned. But it
        // is a *different* no: `retryable` tells the module this one is worth one more
        // attempt, so a blip at boot does not cost the player the world for the session.
        if (!cancelled) postToGame({ t: 'commons:state', available: false, retryable: true });
      }
    }

    async function drainKey(key: string) {
      if (inFlight.has(key)) return;
      inFlight.add(key);
      try {
        // Keeps draining after unmount on purpose, exactly as the save bridge does:
        // stopping on `cancelled` would leave a queued value for the cleanup below to
        // send as a second, parallel request, which could land before the one already
        // in flight. The acks are what gets suppressed once the frame is gone, not the
        // writes themselves.
        for (;;) {
          if (!pending.has(key)) break;
          const next = pending.get(key)!;
          pending.delete(key);
          try {
            const result = next === null ? await deleteWorldEntry(slug!, key) : await putWorldEntry(slug!, key, next);
            postToGame({ t: 'commons:ack', ok: result.ok, key, ...(result.error ? { error: result.error } : {}) });
          } catch (error) {
            // Reported, never thrown at the game: a write that failed must not be able
            // to break a session that is otherwise going fine.
            postToGame({
              t: 'commons:ack',
              ok: false,
              key,
              error: error instanceof Error ? error.message : 'world write failed',
            });
          }
        }
      } finally {
        inFlight.delete(key);
      }
    }

    async function onMessage(event: MessageEvent) {
      // Pin to this theater's frame: any other window posting `gdp` traffic is not the
      // game we are serving, and must not read or write this world.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const message = parseWorldMessage(event.data);
      if (!message) return;

      if (message.t === 'commons:hello' || message.t === 'commons:list') {
        await sendState();
        return;
      }

      pending.set(message.key, message.t === 'commons:put' ? message.fields : null);
      void drainKey(message.key);
    }

    window.addEventListener('message', onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      // Exiting the player is the most common way a session ends, and the module's own
      // flush on `pagehide` has just handed us its last writes. Send them: `keepalive`
      // means the request completes even though this component is going away.
      //
      // Only for keys with no drain running. If one is, it owns that key's queue and
      // will send it in order; firing here as well would race two writes for one entry.
      for (const [key, fields] of [...pending]) {
        if (inFlight.has(key)) continue;
        pending.delete(key);
        const send = fields === null ? deleteWorldEntry(slug, key) : putWorldEntry(slug, key, fields);
        void send.catch(() => undefined);
      }
    };
  }, [frameRef, slug]);
}
