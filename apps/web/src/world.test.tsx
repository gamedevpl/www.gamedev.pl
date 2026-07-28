// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { parseWorldMessage, useWorldBridge } from './world.js';

/**
 * The world bridge has the same trust boundary as the save bridge — hostile generated
 * code on one side, an authenticated API on the other — plus one the save bridge does
 * not: what crosses it ends up on other players' screens.
 *
 * The shell still decides nothing about a write. Schema, ownership, quota and
 * moderation all live server-side where a modified client cannot reach them, so these
 * tests are about what the bridge *forwards*, what it drops before spending a request,
 * and that two writes to one entry can never land out of order.
 */

function frame(payload: Record<string, unknown>) {
  return { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload };
}

describe('parseWorldMessage', () => {
  it('accepts the four requests a game may make', () => {
    expect(parseWorldMessage(frame({ t: 'commons:hello' }))).toEqual({ t: 'commons:hello' });
    expect(parseWorldMessage(frame({ t: 'commons:list' }))).toEqual({ t: 'commons:list' });
    expect(parseWorldMessage(frame({ t: 'commons:put', key: 'plot.1', fields: { plant: 'oak' } }))).toEqual({
      t: 'commons:put',
      key: 'plot.1',
      fields: { plant: 'oak' },
    });
    expect(parseWorldMessage(frame({ t: 'commons:remove', key: 'plot.1' }))).toEqual({
      t: 'commons:remove',
      key: 'plot.1',
    });
  });

  it('drops anything outside the namespace or protocol version', () => {
    expect(parseWorldMessage({ t: 'commons:list' })).toBeNull();
    expect(parseWorldMessage({ ns: 'other', v: PROTOCOL_VERSION, t: 'commons:list' })).toBeNull();
    expect(parseWorldMessage({ ns: BRIDGE_NAMESPACE, v: 99, t: 'commons:list' })).toBeNull();
    expect(parseWorldMessage(null)).toBeNull();
    expect(parseWorldMessage('commons:list')).toBeNull();
  });

  it('drops a key that could escape the world it belongs to', () => {
    for (const key of ['', '../escape', 'has space', '/leading', '.hidden', 'x'.repeat(65), 42, null]) {
      expect(parseWorldMessage(frame({ t: 'commons:put', key, fields: { a: 1 } })), String(key)).toBeNull();
      expect(parseWorldMessage(frame({ t: 'commons:remove', key })), String(key)).toBeNull();
    }
  });

  it('drops a payload that is not a plain object of fields', () => {
    for (const fields of [null, 'oak', 42, ['oak'], undefined]) {
      expect(parseWorldMessage(frame({ t: 'commons:put', key: 'plot.1', fields }))).toBeNull();
    }
  });

  it('drops a runaway payload before it becomes a request', () => {
    const wide: Record<string, number> = {};
    for (let index = 0; index < 13; index++) wide[`f${index}`] = index;
    expect(parseWorldMessage(frame({ t: 'commons:put', key: 'plot.1', fields: wide }))).toBeNull();

    // Pinned either side of the API's own 4 KiB entry cap: a payload the server would
    // certainly reject must not become a request, and one it might accept must.
    expect(parseWorldMessage(frame({ t: 'commons:put', key: 'p', fields: { note: 'x'.repeat(5 * 1024) } }))).toBeNull();
    expect(
      parseWorldMessage(frame({ t: 'commons:put', key: 'p', fields: { note: 'x'.repeat(3 * 1024) } })),
    ).not.toBeNull();
  });

  it('drops fields that cannot be serialized at all', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(parseWorldMessage(frame({ t: 'commons:put', key: 'plot.1', fields: circular }))).toBeNull();
  });
});

/** Mounts the bridge over a real iframe and returns handles to drive it. */
function Harness({ slug }: { slug?: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  useWorldBridge(frameRef, slug);
  return <iframe ref={frameRef} title="game" />;
}

describe('useWorldBridge', () => {
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

  function mount(slug: string | null = 'shared-garden') {
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

  /** Polls until `check` stops throwing — the bridge answers across several microtasks. */
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

  const world = {
    entries: [{ key: 'plot.1', fields: { plant: 'oak' }, mine: false, ownerTag: 'abc', updatedAt: 'now' }],
    maxPerPlayer: 3,
    writable: true,
  };

  it('answers a hello with the world', async () => {
    fetchMock.mockResolvedValue(jsonResponse(world));
    const { fromGame } = mount();

    fromGame({ t: 'commons:hello' });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'commons:state', available: true, writable: true, max: 3 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/games/shared-garden/world');
  });

  it('reports a readable but unwritable world to a signed-out visitor', async () => {
    // The whole reason reads are public: the visitor sees what other people built, and
    // is told plainly that planting needs an account rather than acting into a void.
    fetchMock.mockResolvedValue(jsonResponse({ ...world, writable: false }));
    const { fromGame } = mount();

    fromGame({ t: 'commons:hello' });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'commons:state', available: true, writable: false });
  });

  it('reports no world for a game that has none, and marks it not worth retrying', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'world not found' }, 404));
    const { fromGame } = mount();

    fromGame({ t: 'commons:hello' });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'commons:state', available: false, retryable: false });
  });

  it('marks a failed read retryable, so a blip does not cost the session', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const { fromGame } = mount();

    fromGame({ t: 'commons:hello' });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'commons:state', available: false, retryable: true });
  });

  it('writes an entry and acknowledges it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const { fromGame } = mount();

    fromGame({ t: 'commons:put', key: 'plot.7', fields: { plant: 'fern', note: 'hello' } });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'commons:ack', ok: true, key: 'plot.7' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/games/shared-garden/world/plot.7');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ fields: { plant: 'fern', note: 'hello' } });
    // Without keepalive the write a player makes right before leaving — very often the
    // one they cared about — dies with the tab.
    expect(init.keepalive).toBe(true);
  });

  it('relays a refusal in the server’s own words rather than throwing', async () => {
    // Every 4xx here is something the player should be told: the plot is taken, the
    // note was rejected, you are holding as many things as you may.
    fetchMock.mockResolvedValue(jsonResponse({ error: 'that entry belongs to another player' }, 409));
    const { fromGame } = mount();

    fromGame({ t: 'commons:put', key: 'plot.1', fields: { plant: 'oak' } });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'commons:ack', ok: false, key: 'plot.1' });
    expect(String(toGame[0].error)).toMatch(/another player/);
  });

  it('removes an entry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const { fromGame } = mount();

    fromGame({ t: 'commons:remove', key: 'plot.7' });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(toGame[0]).toMatchObject({ t: 'commons:ack', ok: true, key: 'plot.7' });
  });

  it('never lets an older write to one entry land after a newer one', async () => {
    const resolvers: Array<() => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => resolvers.push(() => resolve(jsonResponse({ ok: true })))),
    );
    const { fromGame } = mount();

    fromGame({ t: 'commons:put', key: 'plot.1', fields: { note: 'first' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fromGame({ t: 'commons:put', key: 'plot.1', fields: { note: 'second' } });
    fromGame({ t: 'commons:put', key: 'plot.1', fields: { note: 'third' } });

    // Only one request is out while the first is in flight, and the intermediate value
    // is dropped rather than queued — nobody wants to watch three writes replay.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolvers.shift()!();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ fields: { note: 'third' } });
  });

  it('does not let a slow write to one entry hold up another', async () => {
    // The reason the queue is per key rather than global: two entries are two documents,
    // and planting in one spot must not wait on a stalled request for a different one.
    const resolvers: Array<() => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => resolvers.push(() => resolve(jsonResponse({ ok: true })))),
    );
    const { fromGame } = mount();

    fromGame({ t: 'commons:put', key: 'plot.1', fields: { note: 'one' } });
    fromGame({ t: 'commons:put', key: 'plot.2', fields: { note: 'two' } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/games/shared-garden/world/plot.1',
      '/api/games/shared-garden/world/plot.2',
    ]);
  });

  it('ignores traffic from a window that is not the game frame', async () => {
    // Anybody who can post into this page would otherwise be writing into a world on
    // this player's behalf.
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    mount();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: frame({ t: 'commons:put', key: 'plot.1', fields: { note: 'not from the game' } }),
        source: window,
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays quiet for a game with no published slug', async () => {
    const { fromGame } = mount(null);
    fromGame({ t: 'commons:hello' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a queued write even though the player has already left', async () => {
    // Leaving the theater is how most sessions end, and the module flushes on pagehide
    // as it goes. `keepalive` is what makes that last write land.
    const resolvers: Array<() => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => resolvers.push(() => resolve(jsonResponse({ ok: true })))),
    );
    const { fromGame } = mount();

    fromGame({ t: 'commons:put', key: 'plot.1', fields: { note: 'first' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fromGame({ t: 'commons:put', key: 'plot.1', fields: { note: 'second' } });

    // A drain owns plot.1, so unmounting must NOT fire a second parallel request for
    // it — that is the race the serialization exists to prevent.
    act(() => root!.unmount());
    root = null;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers.shift()!();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ fields: { note: 'second' } });
  });
});
