// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_NAMESPACE } from './mp/protocol.js';
import { ZONE_PROTOCOL_VERSION } from './zone/protocol.js';
import { useZoneBridge } from './zone.js';
import * as playerModule from './gamePlayer.js';

/**
 * The zone bridge is the third and last of the shell's bridges, and the one where the
 * game is not asking for something but being told what is true, ten times a second.
 *
 * What these tests hold is that the shell stays a relay. It never reads a snapshot, it
 * forwards a delta without interpreting it, it refuses the two things a client must not
 * be allowed to assert, and it hangs up when the player leaves rather than letting an
 * empty world tick — which is the mechanism the whole cost model rests on.
 */

function frame(payload: Record<string, unknown>) {
  return { ns: BRIDGE_NAMESPACE, v: ZONE_PROTOCOL_VERSION, ...payload };
}

/** A WebSocket that never touches a network but behaves like one for the client. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
  }

  open() {
    this.onopen?.();
  }

  deliver(payload: Record<string, unknown>) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ v: ZONE_PROTOCOL_VERSION, ...payload }) }));
  }

  framesSent() {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
  }
}

function Harness({ slug }: { slug?: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  useZoneBridge(frameRef, slug);
  return <iframe ref={frameRef} title="game" />;
}

describe('useZoneBridge', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let toGame: Array<Record<string, unknown>>;
  let container: HTMLDivElement;
  let root: Root | null;

  const admission = {
    zone: 'ember-watch',
    hostUrl: 'https://world.example.run.app',
    ticket: 'ticket-abc',
    expiresAt: Date.now() + 60_000,
    tickHz: 10,
    maxPlayers: 4,
    inputs: [{ k: 'move', type: 'enum', values: ['n', 's', 'e', 'w'] }],
    durable: true,
  };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    toGame = [];
    FakeSocket.instances = [];
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    vi.stubGlobal('WebSocket', FakeSocket);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = null;
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mount(slug: string | null = 'ember-watch') {
    root = createRoot(container);
    act(() => root!.render(<Harness slug={slug ?? undefined} />));
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const gameWindow = iframe.contentWindow as Window;
    vi.spyOn(gameWindow, 'postMessage').mockImplementation(((message: Record<string, unknown>) => {
      toGame.push(message);
    }) as typeof gameWindow.postMessage);

    const fromGame = (payload: Record<string, unknown>) => {
      window.dispatchEvent(new MessageEvent('message', { data: frame(payload), source: gameWindow }));
    };
    return { fromGame, gameWindow };
  }

  async function waitFor(check: () => void, attempts = 50) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        check();
        return;
      } catch (error) {
        if (attempt === attempts - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }
  }

  function jsonResponse(body: unknown, status = 200) {
    return { ok: status < 400, status, json: async () => body } as Response;
  }

  /** Gets to a live socket: hello, admission, connect, open. */
  async function connected() {
    fetchMock.mockResolvedValue(jsonResponse(admission));
    const handles = mount();
    handles.fromGame({ t: 'zone:hello' });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const socket = FakeSocket.instances[0];
    act(() => socket.open());
    return { ...handles, socket };
  }

  it('says nothing until the game asks', async () => {
    fetchMock.mockResolvedValue(jsonResponse(admission));
    mount();
    await new Promise((resolve) => setTimeout(resolve, 10));
    // The bridge is mounted for every published game. A game that never ships a sim
    // never says hello, and must cost nothing at all — not a request, not a socket.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it('answers a hello with the zone and dials the host it was told about', async () => {
    const { socket } = await connected();

    expect(toGame[0]).toMatchObject({
      t: 'zone:state',
      available: true,
      zone: 'ember-watch',
      tickHz: 10,
      durable: true,
    });
    expect(socket.url).toBe('wss://world.example.run.app/zone/ws');
    await waitFor(() => expect(socket.framesSent()[0]).toMatchObject({ t: 'hello', zone: 'ember-watch' }));
  });

  it('keeps the ticket out of the URL', async () => {
    // Query strings land in access logs and Referer headers. Party join tokens follow
    // the same rule and for the same reason.
    const { socket } = await connected();
    expect(socket.url).not.toContain('ticket');
    expect(socket.framesSent()[0]).toMatchObject({ ticket: 'ticket-abc' });
  });

  it('tells a game with no zone that there is nothing here, permanently', async () => {
    // The ordinary case for 87 of 88 games. Not an error, and not worth retrying into.
    fetchMock.mockResolvedValue(jsonResponse({ error: 'zone not found' }, 404));
    const { fromGame } = mount();
    fromGame({ t: 'zone:hello' });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'zone:state', available: false, retryable: false });
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it('distinguishes could-not-find-out from nothing-here', async () => {
    // The save bridge learned this: a read that failed on a flaky connection must not
    // cost a player the capability for the whole session.
    fetchMock.mockRejectedValue(new Error('offline'));
    const { fromGame } = mount();
    fromGame({ t: 'zone:hello' });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'zone:state', available: false, retryable: true });
  });

  it('relays snapshots and deltas without reading them', async () => {
    const { socket } = await connected();
    act(() => {
      socket.deliver({ t: 'snap', tick: 30, seed: 7, draws: 412, state: '{"t":30,"trees":91}' });
      socket.deliver({ t: 'delta', tick: 31, ev: [{ slot: 1, k: 'move', v: 'n' }] });
    });

    const snap = toGame.find((message) => message.t === 'zone:snap');
    // Still a string. The shell has no opinion about the shape of a world, and the sim
    // on the other side of the bridge is the only thing that does.
    expect(snap).toMatchObject({ tick: 30, seed: 7, draws: 412, state: '{"t":30,"trees":91}' });
    expect(typeof snap!.state).toBe('string');

    expect(toGame.find((message) => message.t === 'zone:delta')).toMatchObject({
      tick: 31,
      ev: [{ slot: 1, k: 'move', v: 'n' }],
    });
  });

  it('forwards a declared input, tagged by nobody', async () => {
    const { fromGame, socket } = await connected();
    fromGame({ t: 'zone:send', k: 'move', d: 'n' });

    await waitFor(() => expect(socket.framesSent()).toHaveLength(2));
    const input = socket.framesSent()[1];
    expect(input).toMatchObject({ t: 'input', k: 'move', d: 'n' });
    // The host attaches the slot. A client that could name its own would be able to act
    // as another player.
    expect(input).not.toHaveProperty('slot');
  });

  it('never forwards a reserved kind, however the game dresses it', async () => {
    const { fromGame, socket } = await connected();
    fromGame({ t: 'zone:send', k: 'join' });
    fromGame({ t: 'zone:send', k: 'leave', d: 2 });

    await new Promise((resolve) => setTimeout(resolve, 10));
    // Only the hello. Arrivals and departures are facts the host knows, not claims a
    // client may make.
    expect(socket.framesSent()).toHaveLength(1);
  });

  it('stops forwarding a game that floods, without killing the session', async () => {
    const { fromGame, socket } = await connected();
    for (let index = 0; index < 100; index += 1) fromGame({ t: 'zone:send', k: 'move', d: 'n' });

    await new Promise((resolve) => setTimeout(resolve, 10));
    // Bounded at the host's own limit, so a game that trips this was going to be
    // disconnected anyway — the bridge just declines to spend the connection on it.
    const inputs = socket.framesSent().filter((sent) => sent.t === 'input');
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.length).toBeLessThanOrEqual(30);
    expect(socket.closed).toBe(false);
  });

  it('passes a resync request through', async () => {
    const { fromGame, socket } = await connected();
    fromGame({ t: 'zone:resync' });

    await waitFor(() => expect(socket.framesSent().some((sent) => sent.t === 'resync')).toBe(true));
  });

  it('tells the game when the link changes state', async () => {
    const { socket } = await connected();
    act(() => socket.deliver({ t: 'closed', reason: 'hibernating' }));

    expect(toGame.some((message) => message.t === 'zone:link' && message.status === 'connected')).toBe(true);
    expect(toGame.find((message) => message.t === 'zone:closed')).toMatchObject({ reason: 'hibernating' });
  });

  it('ignores traffic from any window that is not the game frame', async () => {
    const { socket } = await connected();
    window.dispatchEvent(new MessageEvent('message', { data: frame({ t: 'zone:send', k: 'move', d: 'n' }) }));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(socket.framesSent()).toHaveLength(1);
  });

  it('hangs up when the player leaves, so the zone can hibernate promptly', async () => {
    // The mechanism the cost model rests on (docs/p3-zone-host-infra.md §4): the last
    // socket closing is what drains the instance. A socket idling out its timeout keeps
    // an empty world ticking and an instance alive to tick it.
    const { socket } = await connected();
    act(() => root!.unmount());
    root = null;

    expect(socket.closed).toBe(true);
    expect(socket.framesSent().some((sent) => sent.t === 'bye')).toBe(true);
  });
  it('sends a late frame to the session it came from, not the one open now', async () => {
    // The socket outlives the bridge: close() closes it asynchronously and the message
    // handler does not check for disposal, so a frame queued before teardown still
    // arrives. The danger is not that it is recorded — it is *where*. Resolved per call,
    // it would land on whichever game is open now, marking a session `joined` that never
    // connected and handing a game a Shared rate it did not earn.
    //
    // So the property is that the recorder is bound once, at admission, and never
    // rebound: the late event goes to the originating session, which by then is closed
    // and refuses it. Binding identity is what makes that true, so binding identity is
    // what this asserts.
    const recorded: Array<{ binding: number; step: string }> = [];
    let bindings = 0;
    const bind = vi.spyOn(playerModule, 'bindPlayRecorder').mockImplementation(() => {
      const binding = bindings++;
      return (event) => void recorded.push({ binding, step: (event as { step: string }).step });
    });

    const { socket } = await connected();
    await waitFor(() => expect(recorded).toEqual([{ binding: 0, step: 'admitted' }]));

    act(() => root!.unmount());
    root = null;
    act(() => socket.deliver({ t: 'snap', tick: 0, seed: 1, draws: 0, state: '{}', slot: 0 }));

    // One binding for the whole run, and the straggler carries it.
    expect(bind).toHaveBeenCalledTimes(1);
    expect(recorded).toEqual([
      { binding: 0, step: 'admitted' },
      { binding: 0, step: 'joined' },
    ]);
  });
});
