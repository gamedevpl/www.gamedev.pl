import type { SocketStatus } from '@gamedevpl/contract';
import { parseZoneServerFrame, zoneSocketUrl, ZONE_PROTOCOL_VERSION, type ZoneServerFrame } from './protocol.js';
import { createReconnectBackoff, type ReconnectBackoff } from '../core/reconnectBackoff.js';

/**
 * One websocket to a zone host, for one player.
 *
 * The party-mode `RoomClient` is the shape this follows, and the reasons it reconnects
 * apply here more strongly rather than less: phones sleep, tabs get backgrounded, and
 * Cloud Run caps a connection at sixty minutes, so a dropped socket is the ordinary
 * case. What is different is what a reconnect *means*. A party guest reconnecting takes
 * a free slot; a zone player reconnecting rejoins **a world that kept running without
 * them** — possibly one that hibernated and was woken by their return. So a reconnect
 * always re-establishes from a snapshot rather than resuming a stream, which is also
 * why the client tracks nothing about state itself. It carries frames; the game owns
 * the world.
 */

export type ZoneStatus = SocketStatus;

export interface ZoneClientOptions {
  /** Base URL of the host that owns this zone, from the admission response. */
  hostUrl: string;
  zone: string;
  /** Short-lived HMAC ticket minted by the API. Never appears in a URL. */
  ticket: string;
  onFrame: (frame: ZoneServerFrame) => void;
  onStatus: (status: ZoneStatus, reason?: string) => void;
}

/**
 * Reasons where reconnecting cannot help.
 *
 * Deliberately shorter than party mode's list, and the omission is the interesting
 * part: `zone_full` is *not* final. A zone is a place rather than a session, so a full
 * one is a queue to wait in, not a door that closed — the retry loop backs off and the
 * player gets in when a seat frees. `hibernating` is likewise transient by definition:
 * the host is snapshotting and will accept the next dial.
 */
const FINAL_REASONS = new Set(['kicked', 'expired', 'bad_ticket', 'zone_not_found', 'bye', 'unsupported']);

export class ZoneClient {
  private socket: WebSocket | null = null;
  private readonly options: ZoneClientOptions;
  private readonly backoff: ReconnectBackoff = createReconnectBackoff();
  private retryTimer: number | null = null;
  private disposed = false;

  constructor(options: ZoneClientOptions) {
    this.options = options;
  }

  connect(): void {
    if (this.disposed) return;
    this.options.onStatus(this.backoff.isFirstAttempt() ? 'connecting' : 'reconnecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(zoneSocketUrl(this.options.hostUrl));
    } catch {
      // A malformed host URL is not something retrying fixes, and it is the one
      // failure that throws synchronously rather than arriving as a close event.
      this.disposed = true;
      this.options.onStatus('closed', 'unreachable');
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.backoff.reset();
      // The ticket travels in the first frame, never in the URL: query strings land in
      // access logs and Referer headers, which is the same rule party join tokens follow.
      socket.send(
        JSON.stringify({ v: ZONE_PROTOCOL_VERSION, t: 'hello', zone: this.options.zone, ticket: this.options.ticket }),
      );
      this.options.onStatus('connected');
    };

    socket.onmessage = (event: MessageEvent) => {
      let payload: unknown;
      try {
        payload = JSON.parse(typeof event.data === 'string' ? event.data : '');
      } catch {
        return;
      }
      const frame = parseZoneServerFrame(payload);
      if (!frame) return;
      if (frame.t === 'closed' && FINAL_REASONS.has(frame.reason)) {
        this.disposed = true;
      }
      this.options.onFrame(frame);
    };

    socket.onclose = () => {
      if (this.disposed) {
        this.options.onStatus('closed');
        return;
      }
      this.scheduleRetry();
    };

    socket.onerror = () => {
      // onclose always follows; retry scheduling lives there so it happens once.
    };
  }

  private scheduleRetry(): void {
    if (this.disposed) return;
    const delay = this.backoff.nextDelayMs();
    if (delay === null) {
      // Unlike party mode, a spent budget disposes the client.
      this.disposed = true;
      this.options.onStatus('closed', 'unreachable');
      return;
    }
    this.options.onStatus('reconnecting');
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }

  private send(frame: Record<string, unknown>): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ v: ZONE_PROTOCOL_VERSION, ...frame }));
    return true;
  }

  /**
   * Sends one input. Returns false when the socket is not up.
   *
   * Dropped rather than queued, deliberately. An input is an intent about a moment —
   * "step north, now" — and a zone that replayed a second of buffered intents on
   * reconnect would act out a plan the player abandoned while the screen was frozen.
   * Party mode makes the same call for the same reason.
   */
  sendInput(kind: string, value?: number | string | boolean): boolean {
    // `d`, not `v` — see the note on parseZoneBridgeMessage. The frame's `v` is the
    // protocol version, and an enum input carrying its value under that name would be
    // read by the host as a client speaking a protocol it does not know.
    return this.send(value === undefined ? { t: 'input', k: kind } : { t: 'input', k: kind, d: value });
  }

  /** Asks for a fresh snapshot, after the game notices its predicted state has drifted. */
  requestResync(): boolean {
    return this.send({ t: 'resync' });
  }

  close(): void {
    this.disposed = true;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    // `bye` lets the host retire the slot immediately and, if it was the last one, begin
    // hibernating — rather than waiting out a socket timeout while an empty world ticks.
    this.send({ t: 'bye' });
    this.socket?.close();
    this.socket = null;
  }
}
