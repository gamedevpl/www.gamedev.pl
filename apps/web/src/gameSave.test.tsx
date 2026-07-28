// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGameSaveMessage, useGameSaveBridge } from './gameSave.js';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';

/**
 * The bridge is the piece with a trust boundary on both sides: hostile generated code
 * on one, a real authenticated API on the other. These tests drive it the way the
 * product does — a real iframe posting real messages — rather than asserting on its
 * internals.
 */

function frame(payload: Record<string, unknown>) {
  return { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload };
}

describe('parseGameSaveMessage', () => {
  it('accepts the three requests a game may make', () => {
    expect(parseGameSaveMessage(frame({ t: 'save:hello', version: 2 }))).toEqual({ t: 'save:hello', version: 2 });
    expect(parseGameSaveMessage(frame({ t: 'save:put', data: '{"a":1}', version: 2 }))).toEqual({
      t: 'save:put',
      data: '{"a":1}',
      version: 2,
    });
    expect(parseGameSaveMessage(frame({ t: 'save:clear' }))).toEqual({ t: 'save:clear' });
    expect(parseGameSaveMessage(frame({ t: 'save:load', rid: 3 }))).toEqual({ t: 'save:load', rid: 3 });
  });

  it('normalizes a nonsense request id to the module’s own retry', () => {
    for (const rid of [-1, 'x', undefined, Infinity, NaN]) {
      expect(parseGameSaveMessage(frame({ t: 'save:load', rid }))).toEqual({ t: 'save:load', rid: 0 });
    }
  });

  it('drops anything outside the namespace or protocol version', () => {
    expect(parseGameSaveMessage({ t: 'save:clear' })).toBeNull();
    expect(parseGameSaveMessage({ ns: 'other', v: PROTOCOL_VERSION, t: 'save:clear' })).toBeNull();
    expect(parseGameSaveMessage({ ns: BRIDGE_NAMESPACE, v: 99, t: 'save:clear' })).toBeNull();
    expect(parseGameSaveMessage(null)).toBeNull();
    expect(parseGameSaveMessage('save:clear')).toBeNull();
  });

  it('drops a write whose payload is not a string, or is too large to keep', () => {
    expect(parseGameSaveMessage(frame({ t: 'save:put', data: { level: 1 } }))).toBeNull();
    expect(parseGameSaveMessage(frame({ t: 'save:put', data: '' }))).toBeNull();
    expect(parseGameSaveMessage(frame({ t: 'save:put', data: 'x'.repeat(64 * 1024) }))).toBeNull();
  });

  it('normalizes a nonsense version rather than passing it on', () => {
    const helloVersion = (version: unknown) => {
      const parsed = parseGameSaveMessage(frame({ t: 'save:hello', version }));
      return parsed?.t === 'save:hello' ? parsed.version : undefined;
    };
    expect(helloVersion(-5)).toBe(1);
    expect(helloVersion('two')).toBe(1);
    expect(helloVersion(Infinity)).toBe(1);
  });
});

/** Mounts the bridge over a real iframe and returns handles to drive it. */
function Harness({ slug }: { slug?: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  useGameSaveBridge(frameRef, slug);
  return <iframe ref={frameRef} title="game" />;
}

describe('useGameSaveBridge', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let toGame: unknown[];
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

  function mount(slug: string | null = 'crypt-delver') {
    root = createRoot(container);
    act(() => root!.render(<Harness slug={slug ?? undefined} />));
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const gameWindow = iframe.contentWindow as Window;
    // Record what the shell posts down into the game.
    vi.spyOn(gameWindow, 'postMessage').mockImplementation(((message: unknown) => {
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

  it('answers a hello with the player’s save', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: '{"level":5}', version: 1, updatedAt: 'now' }));
    const { fromGame } = mount();

    fromGame({ t: 'save:hello', version: 1 });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'save:state', available: true, data: '{"level":5}', version: 1 });
  });

  it('reports no slot when the player is signed out', async () => {
    // 401 is an ordinary state, not an error: the game plays on without saving.
    fetchMock.mockResolvedValue(jsonResponse({ error: 'authentication required' }, 401));
    const { fromGame } = mount();

    fromGame({ t: 'save:hello', version: 1 });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'save:state', available: false });
  });

  it('reports no slot when the read fails outright, rather than guessing', async () => {
    // Claiming an empty slot after a failed read would invite the game to overwrite a
    // save we merely could not fetch.
    fetchMock.mockRejectedValue(new Error('network down'));
    const { fromGame } = mount();

    fromGame({ t: 'save:hello', version: 1 });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'save:state', available: false });
  });

  it('writes a save and acknowledges it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const { fromGame } = mount();

    fromGame({ t: 'save:put', data: '{"level":2}', version: 3 });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'save:ack', ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/games/crypt-delver/save');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ data: '{"level":2}', version: 3 });
    // Without keepalive the last write of a session — the one that matters most — dies
    // with the tab that triggered it.
    expect(init.keepalive).toBe(true);
  });

  it('never lets an older write land after a newer one', async () => {
    // The one failure a save system does not get forgiven for. Writes are serialized,
    // so a slow first request cannot be overtaken by a fast second.
    const resolvers: Array<() => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => resolvers.push(() => resolve(jsonResponse({ ok: true })))),
    );
    const { fromGame } = mount();

    fromGame({ t: 'save:put', data: '{"level":1}', version: 1 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fromGame({ t: 'save:put', data: '{"level":2}', version: 1 });
    fromGame({ t: 'save:put', data: '{"level":3}', version: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolvers[0]();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // Only the newest queued value is sent — level 2 was superseded before it left.
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).data).toBe('{"level":3}');
  });

  it('reports a failed write without throwing at the game', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'nope' }, 500));
    const { fromGame } = mount();

    fromGame({ t: 'save:put', data: '{"level":2}', version: 1 });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'save:ack', ok: false });
  });

  it('answers an explicit load, echoing the request id back to the caller', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: '{"deepest":4}', version: 1, updatedAt: 'now' }));
    const { fromGame } = mount();

    fromGame({ t: 'save:load', rid: 7 });

    await waitFor(() => expect(toGame).toHaveLength(1));
    // Without the id echoed back, a reply cannot be matched to the `load()` that asked
    // for it, and a game with two reads in flight resolves the wrong one.
    expect(toGame[0]).toMatchObject({ t: 'save:state', rid: 7, available: true, data: '{"deepest":4}' });
  });

  it('tells the game a signed-out slot is not worth retrying', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'authentication required' }, 401));
    const { fromGame } = mount();

    fromGame({ t: 'save:hello', version: 1 });

    await waitFor(() => expect(toGame).toHaveLength(1));
    // The distinction that keeps an anonymous visitor from being polled forever.
    expect(toGame[0]).toMatchObject({ t: 'save:state', available: false, retryable: false });
  });

  it('marks a read that failed as worth one more try', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const { fromGame } = mount();

    fromGame({ t: 'save:hello', version: 1 });

    await waitFor(() => expect(toGame).toHaveLength(1));
    expect(toGame[0]).toMatchObject({ t: 'save:state', available: false, retryable: true });
  });

  it('deletes on clear', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const { fromGame } = mount();

    fromGame({ t: 'save:clear' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('ignores traffic from any window that is not the game frame', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    mount();

    // A second frame on the page posting well-formed save traffic must not be able to
    // read or write the player's save for the game actually on stage.
    const impostor = document.createElement('iframe');
    document.body.appendChild(impostor);
    window.dispatchEvent(
      new MessageEvent('message', {
        data: frame({ t: 'save:put', data: '{"hacked":true}', version: 1 }),
        source: impostor.contentWindow,
      }),
    );

    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays completely quiet for a game that never asks', async () => {
    mount();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toGame).toHaveLength(0);
  });

  it('does nothing at all without a published slug', async () => {
    const { fromGame } = mount(null);
    fromGame({ t: 'save:hello', version: 1 });
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
