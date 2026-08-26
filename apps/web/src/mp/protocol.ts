/**
 * Wire + bridge protocol for multiplayer party sessions (docs/multiplayer-plan.md).
 *
 * Two channels meet in this app:
 *  - the WEBSOCKET to our room relay, carrying controller input from phones;
 *  - the POSTMESSAGE bridge into the sandboxed game iframe.
 *
 * Both carry untrusted data (a guest's phone on one side, generated game code on
 * the other), so every frame is narrowed by the guards below before it is used.
 */

import { INPUT_KEYS, ROOM_PHASES, type InputKey, type RoomPhase } from '@gamedevpl/contract';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION, type GdpEnvelope } from '../editorControllerProtocol.js';

export { INPUT_KEYS, ROOM_PHASES, type InputKey, type RoomPhase };
export { BRIDGE_NAMESPACE, PROTOCOL_VERSION, type GdpEnvelope };

export interface RosterSlot {
  slot: number;
  color: string;
  nick: string | null;
  connected: boolean;
}

export type ServerFrame =
  | { t: 'ready'; code: string; slug: string; phase: RoomPhase }
  | { t: 'welcome'; slot: number; color: string; nick: string; phase: RoomPhase }
  | { t: 'roster'; slots: RosterSlot[] }
  | { t: 'input'; slot: number; k: InputKey; d: 0 | 1 }
  | { t: 'phase'; phase: RoomPhase }
  | { t: 'closed'; reason: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPhase(value: unknown): value is RoomPhase {
  return value === 'lobby' || value === 'playing' || value === 'ended';
}

function isInputKey(value: unknown): value is InputKey {
  return INPUT_KEYS.some((key) => key === value);
}

function parseRoster(value: unknown): RosterSlot[] | null {
  if (!Array.isArray(value)) return null;
  const slots: RosterSlot[] = [];
  for (const entry of value) {
    if (!isObject(entry) || typeof entry.slot !== 'number') return null;
    slots.push({
      slot: entry.slot,
      color: typeof entry.color === 'string' ? entry.color : '#00e4ac',
      nick: typeof entry.nick === 'string' ? entry.nick : null,
      connected: entry.connected === true,
    });
  }
  return slots;
}

/** Narrows one relay frame. Returns null for anything unrecognized — never throws. */
export function parseServerFrame(raw: unknown): ServerFrame | null {
  if (!isObject(raw) || raw.v !== PROTOCOL_VERSION) return null;

  switch (raw.t) {
    case 'ready':
      return typeof raw.code === 'string' && typeof raw.slug === 'string' && isPhase(raw.phase)
        ? { t: 'ready', code: raw.code, slug: raw.slug, phase: raw.phase }
        : null;
    case 'welcome':
      return typeof raw.slot === 'number' && typeof raw.color === 'string' && isPhase(raw.phase)
        ? {
            t: 'welcome',
            slot: raw.slot,
            color: raw.color,
            nick: typeof raw.nick === 'string' ? raw.nick : '',
            phase: raw.phase,
          }
        : null;
    case 'roster': {
      const slots = parseRoster(raw.slots);
      return slots ? { t: 'roster', slots } : null;
    }
    case 'input':
      // `d` carries the key state; `v` is the protocol version on every frame.
      return typeof raw.slot === 'number' && isInputKey(raw.k) && (raw.d === 0 || raw.d === 1)
        ? { t: 'input', slot: raw.slot, k: raw.k, d: raw.d }
        : null;
    case 'phase':
      return isPhase(raw.phase) ? { t: 'phase', phase: raw.phase } : null;
    case 'closed':
      return { t: 'closed', reason: typeof raw.reason === 'string' ? raw.reason : 'closed' };
    default:
      return null;
  }
}

/** A message coming OUT of the game iframe. Hostile by assumption. */
export type GameBridgeMessage = { t: 'hello'; slots: number } | { t: 'phase'; phase: RoomPhase };

export function parseGameBridgeMessage(raw: unknown): GameBridgeMessage | null {
  if (!isObject(raw) || raw.ns !== BRIDGE_NAMESPACE || raw.v !== PROTOCOL_VERSION) return null;
  if (raw.t === 'hello') {
    // A game claiming a silly slot count must not size our UI.
    const slots = typeof raw.slots === 'number' && raw.slots >= 1 && raw.slots <= 8 ? raw.slots : 1;
    return { t: 'hello', slots };
  }
  if (raw.t === 'phase' && isPhase(raw.phase)) {
    return { t: 'phase', phase: raw.phase };
  }
  return null;
}

/**
 * The websocket URL for the relay.
 *
 * Three cases, in priority order:
 *
 * 1. `VITE_MP_RELAY_URL` — the relay runs as its own Cloud Run service
 *    (store-launch-plan.md T0, private www.gamedev.pl-ops repo). It is pinned to one instance because rooms are
 *    per-instance memory; the app service is not, which is the whole point of the split.
 *    Once set, the app origin does not serve `/api/mp/ws` at all, so this must win.
 * 2. `VITE_API_BASE_URL` — dev, where the API is a separate Fastify port.
 * 3. Same origin — the single-process default.
 *
 * Only the *socket* moves. Room creation still goes to the app origin, which holds the
 * session cookie and forwards to the relay server-side; a browser never talks to the
 * relay's create route.
 */
export function roomSocketUrl(): string {
  return socketUrlFrom(
    import.meta.env.VITE_MP_RELAY_URL,
    import.meta.env.VITE_API_BASE_URL,
    typeof window === 'undefined' ? '' : window.location.origin,
  );
}

/**
 * The choice above, as a pure function, because the env half cannot be tested: Vite
 * statically inlines `import.meta.env.VITE_*` at transform time, so a test that assigns to
 * it asserts nothing. The precedence rule is the part worth pinning anyway.
 */
export function socketUrlFrom(
  relayUrl: string | undefined,
  apiBaseUrl: string | undefined,
  pageOrigin: string,
): string {
  const chosen =
    relayUrl && relayUrl.length > 0 ? relayUrl : apiBaseUrl && apiBaseUrl.length > 0 ? apiBaseUrl : pageOrigin;
  return `${chosen.replace(/\/+$/, '').replace(/^http/, 'ws')}/api/mp/ws`;
}
