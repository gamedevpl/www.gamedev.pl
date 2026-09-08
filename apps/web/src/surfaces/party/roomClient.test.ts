// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomClient, type RoomStatus } from './roomClient.js';
import { PROTOCOL_VERSION, type ServerFrame } from '../../mp/protocol.js';

// The only socket shape the room client ever sees.
class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  sent: string[] = [];

  constructor() {
    FakeSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.();
  }

  // Server → client, the way the relay answers a hello.
  deliver(frame: ServerFrame) {
    this.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, ...frame }) } as MessageEvent);
  }
}

describe('RoomClient refusals', () => {
  let frames: ServerFrame[];
  let statuses: Array<{ status: RoomStatus; reason?: string }>;

  function connect() {
    const client = new RoomClient({
      code: 'ABCDEF',
      token: 'token',
      nick: 'Bo',
      onFrame: (frame) => frames.push(frame),
      onStatus: (status, reason) => statuses.push({ status, reason }),
    });
    client.connect();
    return client;
  }

  // One refusal round-trip: open, refused, dropped.
  function refuse(reason: string) {
    const socket = FakeSocket.instances.at(-1) as FakeSocket;
    socket.onopen?.();
    socket.deliver({ t: 'closed', reason });
    socket.close();
  }

  beforeEach(() => {
    frames = [];
    statuses = [];
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket as unknown as typeof WebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits out a room that refuses a guest, then gives up for real', () => {
    // A phone that slept through a round is told "invalid".
    connect();
    refuse('room_full_or_invalid');
    expect(frames).toEqual([]);
    expect(statuses.at(-1)?.status).toBe('reconnecting');

    // Three waits, each dialling again.
    for (const wait of [1_000, 2_000, 4_000]) {
      vi.advanceTimersByTime(wait);
      refuse('room_full_or_invalid');
    }

    // The fourth refusal is the answer: the caller finally hears it.
    expect(frames).toEqual([{ t: 'closed', reason: 'room_full_or_invalid' }]);
    expect(FakeSocket.instances).toHaveLength(4);

    // And nothing dials again afterwards.
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(4);
  });

  it('starts the budget over once a seat is actually claimed', () => {
    connect();
    refuse('room_full_or_invalid');
    vi.advanceTimersByTime(1_000);

    const socket = FakeSocket.instances.at(-1) as FakeSocket;
    socket.onopen?.();
    socket.deliver({ t: 'welcome', slot: 2, color: '#ff5566', nick: 'Bo', phase: 'playing' });
    socket.close();

    // A later refusal gets all three waits, not the leftover one.
    refuse('room_full_or_invalid');
    for (const wait of [1_000, 2_000, 4_000]) {
      vi.advanceTimersByTime(wait);
      refuse('room_full_or_invalid');
    }
    expect(frames.filter((frame) => frame.t === 'closed')).toHaveLength(1);
  });

  it('never retries a room that is genuinely gone', () => {
    connect();
    refuse('room_not_found');
    expect(frames).toEqual([{ t: 'closed', reason: 'room_not_found' }]);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
