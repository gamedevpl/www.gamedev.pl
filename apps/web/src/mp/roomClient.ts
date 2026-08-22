import type { SocketStatus } from '@gamedevpl/contract';
import { parseServerFrame, PROTOCOL_VERSION, roomSocketUrl, type InputKey, type ServerFrame } from './protocol.js';

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
  private retries = 0;
  private retryTimer: number | null = null;
  private disposed = false;

  /** Server-stated reasons where reconnecting cannot help. */
  private static readonly FINAL_REASONS = new Set([
    'kicked',
    'host_left',
    'expired',
    'replaced',
    'room_not_found',
    'room_full_or_invalid',
    'bye',
  ]);

  constructor(options: RoomClientOptions) {
    this.options = options;
  }

  connect(): void {
    if (this.disposed) return;
    this.options.onStatus(this.retries === 0 ? 'connecting' : 'reconnecting');

    const socket = new WebSocket(roomSocketUrl());
    this.socket = socket;

    socket.onopen = () => {
      this.retries = 0;
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
      if (frame.t === 'closed' && RoomClient.FINAL_REASONS.has(frame.reason)) {
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
    this.retries += 1;
    if (this.retries > 8) {
      this.options.onStatus('closed', 'unreachable');
      return;
    }
    const delay = Math.min(500 * 2 ** (this.retries - 1), 8000);
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

  setPhase(phase: 'lobby' | 'playing' | 'ended'): void {
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
