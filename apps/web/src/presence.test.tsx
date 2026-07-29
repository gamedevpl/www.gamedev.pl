// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { parsePresenceMessage, usePresenceBridge } from './presence.js';

/**
 * The presence bridge is the first place on the platform where the *shell* owns a clock
 * on the game's behalf, and that is what most of this file is about.
 *
 * Everywhere else, a request happens because a player did something: they saved, they
 * planted. Here requests happen because time passed, and if the game could set that
 * interval then a hostile or merely careless generated game would have a periodic
 * request primitive pointed at our API. So: the game says *where it is*, this side
 * decides *how often anybody hears about it*, and a game calling `here()` sixty times a
 * second must produce exactly the same request rate as one calling it twice.
 */

function frame(payload: Record<string, unknown>) {
  return { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload };
}

describe('parsePresenceMessage', () => {
  it('accepts the three requests a game may make', () => {
    expect(parsePresenceMessage(frame({ t: 'presence:hello' }))).toEqual({ t: 'presence:hello' });
    expect(parsePresenceMessage(frame({ t: 'presence:away' }))).toEqual({ t: 'presence:away' });
    expect(parsePresenceMessage(frame({ t: 'presence:here', col: 3, row: 4 }))).toEqual({
      t: 'presence:here',
      col: 3,
      row: 4,
    });
  });

  it('drops anything outside the namespace or protocol version', () => {
    expect(parsePresenceMessage({ t: 'presence:hello' })).toBeNull();
    expect(parsePresenceMessage({ ns: 'other', v: PROTOCOL_VERSION, t: 'presence:hello' })).toBeNull();
    expect(parsePresenceMessage({ ns: BRIDGE_NAMESPACE, v: 99, t: 'presence:hello' })).toBeNull();
    expect(parsePresenceMessage(null)).toBeNull();
    expect(parsePresenceMessage('presence:hello')).toBeNull();
  });

  it('truncates a fractional tile rather than dropping the report', () => {
    // The declared space is tiles, so 3.7 plainly means the fourth column. Rejecting it
    // would only teach authors to round before every call.
    expect(parsePresenceMessage(frame({ t: 'presence:here', col: 3.7, row: -0.5 }))).toEqual({
      t: 'presence:here',
      col: 3,
      row: 0,
    });
  });

  it('drops a coordinate that could never be a tile', () => {
    for (const value of [Number.NaN, Infinity, -Infinity, 1e9, '3', null, undefined]) {
      expect(parsePresenceMessage(frame({ t: 'presence:here', col: value, row: 1 })), String(value)).toBeNull();
      expect(parsePresenceMessage(frame({ t: 'presence:here', col: 1, row: value })), String(value)).toBeNull();
    }
  });
});

function Harness({ slug }: { slug?: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  usePresenceBridge(frameRef, slug);
  return <iframe ref={frameRef} title="game" />;
}

describe('usePresenceBridge', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let toGame: Array<Record<string, unknown>>;
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    toGame = [];
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = null;
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function mount(slug: string | null = 'wanderers-green') {
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

  const roster = {
    count: 3,
    peers: [{ tag: 'aaaa1111', col: 3, row: 4 }],
    visible: true,
    ttlMs: 40000,
    heartbeatMs: 12000,
  };

  function calls(method: string) {
    return fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);
  }

  it('answers a hello with a read, not a heartbeat', async () => {
    // Reading is what a signed-out visitor gets, and it also means a signed-in player
    // does not enter the roster before the game has said where they are — otherwise
    // everybody who opens a world game appears at the origin tile for one poll.
    fetchMock.mockResolvedValue(jsonResponse(roster));
    const { fromGame } = mount();

    fromGame({ t: 'presence:hello' });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'presence:state', available: true, count: 3, visible: true, ttlMs: 40000 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/games/wanderers-green/presence');
    expect(calls('POST')).toHaveLength(0);
  });

  it('never forwards a uid or any peer field the game did not ask for', async () => {
    fetchMock.mockResolvedValue(jsonResponse(roster));
    const { fromGame } = mount();

    fromGame({ t: 'presence:hello' });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0].peers).toEqual([{ tag: 'aaaa1111', col: 3, row: 4 }]);
  });

  it('reports no roster for a game that declares none', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'presence not found' }, 404));
    const { fromGame } = mount();

    fromGame({ t: 'presence:hello' });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'presence:state', available: false });
  });

  it('reports no roster when the read fails, without throwing at the game', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { fromGame } = mount();

    fromGame({ t: 'presence:hello' });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'presence:state', available: false });
  });

  it('beats once when the game first says where it is', async () => {
    // Waiting out a whole interval would leave a player invisible for twelve seconds
    // after walking in, which is most of the time anybody spends deciding whether a
    // world feels inhabited.
    fetchMock.mockResolvedValue(jsonResponse(roster));
    const { fromGame } = mount();

    fromGame({ t: 'presence:hello' });
    await waitFor(() => expect(toGame).toHaveLength(1));
    fromGame({ t: 'presence:here', col: 7, row: 5 });

    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    expect(JSON.parse(calls('POST')[0][1].body as string)).toEqual({ col: 7, row: 5 });
  });

  it('does not turn a flood of position reports into a flood of requests', async () => {
    // The property the whole design exists for. Sixty `here()` calls, one heartbeat.
    fetchMock.mockResolvedValue(jsonResponse(roster));
    const { fromGame } = mount();

    fromGame({ t: 'presence:hello' });
    await waitFor(() => expect(toGame).toHaveLength(1));
    for (let step = 0; step < 60; step++) fromGame({ t: 'presence:here', col: step % 15, row: 1 });

    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    // Give any stray timer a chance to fire before concluding there was only one.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(calls('POST')).toHaveLength(1);
  });

  it('sends the newest tile, not the one that triggered the beat', async () => {
    fetchMock.mockResolvedValue(jsonResponse(roster));
    const { fromGame } = mount();

    fromGame({ t: 'presence:hello' });
    await waitFor(() => expect(toGame).toHaveLength(1));
    fromGame({ t: 'presence:here', col: 1, row: 1 });
    await waitFor(() => expect(toGame).toHaveLength(2));

    // Walk on, then trigger the next beat the way coming back to the tab does, rather
    // than sitting out a twelve-second interval.
    fromGame({ t: 'presence:here', col: 9, row: 8 });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(calls('POST')).toHaveLength(2));
    expect(JSON.parse(calls('POST')[1][1].body as string)).toEqual({ col: 9, row: 8 });
  });

  it('withdraws when the game walks out of its world', async () => {
    fetchMock.mockResolvedValue(jsonResponse(roster));
    const { fromGame } = mount();

    fromGame({ t: 'presence:hello' });
    await waitFor(() => expect(toGame).toHaveLength(1));
    fromGame({ t: 'presence:here', col: 7, row: 5 });
    // Wait for the beat's *reply*, not just the call: joining is what the response says.
    await waitFor(() => expect(toGame).toHaveLength(2));

    fromGame({ t: 'presence:away' });

    await waitFor(() => expect(calls('DELETE')).toHaveLength(1));
    expect(toGame.at(-1)).toMatchObject({ t: 'presence:state', available: false });
  });

  it('withdraws when the theater closes, rather than leaving a ghost for the whole TTL', async () => {
    fetchMock.mockResolvedValue(jsonResponse(roster));
    const { fromGame } = mount();

    fromGame({ t: 'presence:hello' });
    await waitFor(() => expect(toGame).toHaveLength(1));
    fromGame({ t: 'presence:here', col: 7, row: 5 });
    await waitFor(() => expect(toGame).toHaveLength(2));

    act(() => root!.unmount());
    root = null;

    await waitFor(() => expect(calls('DELETE')).toHaveLength(1));
  });

  it('does not withdraw for a visitor who never joined', async () => {
    // A signed-out visitor has no slot. Sending a DELETE would be a request whose only
    // possible answer is 401, on every exit from every world game.
    fetchMock.mockResolvedValue(jsonResponse({ ...roster, visible: false }));
    const { fromGame } = mount();

    fromGame({ t: 'presence:hello' });
    await waitFor(() => expect(toGame).toHaveLength(1));

    act(() => root!.unmount());
    root = null;

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(calls('DELETE')).toHaveLength(0);
  });

  it('stays silent for a game that never asks for a roster', async () => {
    // The bridge is mounted for every published game, so this is the common case: no
    // hello, no requests, no cost.
    fetchMock.mockResolvedValue(jsonResponse(roster));
    const { fromGame } = mount();

    fromGame({ t: 'presence:here', col: 1, row: 1 });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores traffic from any window but the game frame', async () => {
    fetchMock.mockResolvedValue(jsonResponse(roster));
    mount();

    window.dispatchEvent(new MessageEvent('message', { data: frame({ t: 'presence:hello' }), source: window }));

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing at all without a published slug', async () => {
    fetchMock.mockResolvedValue(jsonResponse(roster));
    const { fromGame } = mount(null);

    fromGame({ t: 'presence:hello' });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
