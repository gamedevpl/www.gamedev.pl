import type { SocketStatus } from '@gamedevpl/contract';
import { createReconnectBackoff, type ReconnectBackoff } from '../../core/reconnectBackoff.js';
import {
  parseServerFrame,
  PROTOCOL_VERSION,
  roomSocketUrl,
  type InputKey,
  type RoomPhase,
  type ServerFrame,
} from '../../mp/protocol.js';

export type RoomStatus = SocketStatus;

export interface RoomClientOptions {
  code: string;
  token: string;
  /** Guests send a nickname; the host omits it. */
  nick?: string;
  onFrame: (frame: ServerFrame) => void;
  onStatus: (status: RoomStatus, reason?: string) => void;
}

/**
 * One websocket to the room relay, for either role.
 *
 * Reconnects automatically: phones sleep, backgrounded tabs get dropped, and
 * Cloud Run caps connection lifetime — so a dropped socket is the normal case,
 * not the exception. Reconnecting re-sends the same hello, which lands the guest
 * back in a free slot rather than ending their game.
 *
 * Reasons the server states as final (the room is gone, or we were kicked) stop
 * the retry loop — retrying those would just spin.
 */
export class RoomClient {
  private socket: WebSocket | null = null;
  private options: RoomClientOptions;
  private readonly backoff: ReconnectBackoff = createReconnectBackoff();
  private retryTimer: number | null = null;
  private disposed = false;

  /** Server-stated reasons where reconnecting cannot help. */
  private static readonly FINAL_REASONS = new Set([
    'kicked',
    'host_left',
    'expired',
    'replaced',
    'room_not_found',
    'bye',
  ]);

  // Refusals that may stop being true; bounded, an invalid room never changes.
  private static readonly REJOINABLE_REASONS = new Set(['room_full_or_invalid']);

  // Long enough for a host to start the next round.
  private static readonly REJOIN_DELAYS_MS = [1_000, 2_000, 4_000];

  private rejoinAttempts = 0;
  // A refusal we are still waiting out, not a plain drop.
  private rejoining = false;

  constructor(options: RoomClientOptions) {
    this.options = options;
  }

  connect(): void {
    if (this.disposed) return;
    this.options.onStatus(this.backoff.isFirstAttempt() ? 'connecting' : 'reconnecting');

    const socket = new WebSocket(roomSocketUrl());
    this.socket = socket;

    socket.onopen = () => {
      this.backoff.reset();
      socket.send(
        JSON.stringify({
          t: 'hello',
          code: this.options.code,
          token: this.options.token,
          ...(this.options.nick ? { nick: this.options.nick } : {}),
        }),
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
      const frame = parseServerFrame(payload);
      if (!frame) return;
      // A seat that answered exists: start the refusal budget fresh.
      if (frame.t === 'welcome') {
        this.rejoinAttempts = 0;
        this.rejoining = false;
      }
      if (frame.t === 'closed') {
        if (RoomClient.FINAL_REASONS.has(frame.reason)) {
          this.disposed = true;
        } else if (RoomClient.REJOINABLE_REASONS.has(frame.reason)) {
          if (this.rejoinAttempts < RoomClient.REJOIN_DELAYS_MS.length) {
            // Swallowed: a `closed` frame reaching the caller means it is over.
            this.rejoining = true;
            this.options.onStatus('reconnecting');
            return;
          }
          // Budget spent: the refusal was the answer after all.
          this.disposed = true;
        }
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
    if (this.rejoining) {
      // Its own curve: the socket opens each attempt, resetting the shared backoff.
      const wait = RoomClient.REJOIN_DELAYS_MS[this.rejoinAttempts];
      this.rejoinAttempts += 1;
      this.retryTimer = window.setTimeout(() => this.connect(), wait);
      return;
    }
    const delay = this.backoff.nextDelayMs();
    if (delay === null) {
      this.options.onStatus('closed', 'unreachable');
      return;
    }
    this.options.onStatus('reconnecting');
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }

  private send(frame: Record<string, unknown>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...frame }));
  }

  sendInput(key: InputKey, value: 0 | 1): void {
    this.send({ t: 'input', k: key, d: value });
  }

  setPhase(phase: RoomPhase): void {
    this.send({ t: 'phase', phase });
  }

  kick(slot: number): void {
    this.send({ t: 'kick', slot });
  }

  close(): void {
    this.disposed = true;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = null;
  }
}
