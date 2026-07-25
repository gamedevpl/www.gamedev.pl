// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

vi.mock('./catalog', () => ({
  fetchPublishedGame: vi.fn(async () => ({
    slug: 'space-hop',
    title: 'Space Hop',
    html: '<html><body>game</body></html>',
  })),
}));

import { PublishedGameFrame } from './PublishedGameFrame';
import type { PublishedGame } from './catalog';

/**
 * The wiring test: a real play of a published game must report itself.
 *
 * The pieces are unit-tested either side of this (the queue's caps, the bridge's
 * health signals), but neither proves the hook is actually mounted where published
 * games play. This one does, and it is the check that would fail if someone later
 * moved playback to a component that forgot to bring the session along.
 */

type WireEvent = { type: string; msSinceOpen: number; slots?: number };
type TelemetryBody = { slug: string; sessionId: string; flushMsSinceOpen: number; events: WireEvent[] };
type FetchSpy = MockInstance<typeof globalThis.fetch>;

function telemetryBodies(fetchSpy: FetchSpy): TelemetryBody[] {
  return fetchSpy.mock.calls
    .filter(([url]) => String(url).includes('/api/telemetry'))
    .map(([, init]) => JSON.parse(String(init?.body)) as TelemetryBody);
}

/** The event minus its timing offset, which every event carries and is asserted apart. */
function payloads(events: WireEvent[]) {
  return events.map(({ msSinceOpen: _ignored, ...event }) => event);
}

describe('PublishedGameFrame telemetry', () => {
  let container: HTMLDivElement;
  let fetchSpy: FetchSpy;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
  });

  it('reports the open as soon as the game document is in hand, and the close on exit', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(<PublishedGameFrame slug="space-hop" title="Space Hop" embed />);
    });

    const opened = telemetryBodies(fetchSpy);
    expect(opened).toHaveLength(1);
    expect(opened[0].slug).toBe('space-hop');
    expect(payloads(opened[0].events)).toEqual([{ type: 'game_opened' }]);
    // Every event carries its age within the session, so batching cannot lose timing.
    expect(opened[0].events[0].msSinceOpen).toBeGreaterThanOrEqual(0);
    expect(typeof opened[0].flushMsSinceOpen).toBe('number');
    // A per-open uuid, not anything stable across sessions.
    expect(opened[0].sessionId).toMatch(/^[0-9a-f-]{36}$/);

    await act(async () => {
      root.unmount();
    });

    const all = telemetryBodies(fetchSpy);
    expect(all).toHaveLength(2);
    expect(payloads(all[1].events)).toEqual([{ type: 'game_closed' }]);
    expect(all[1].sessionId).toBe(opened[0].sessionId);
  });

  it('reports the party size when the game was opened as a party', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(<PublishedGameFrame slug="space-hop" title="Space Hop" embed slots={4} />);
    });

    expect(payloads(telemetryBodies(fetchSpy)[0].events)).toEqual([{ type: 'game_opened', slots: 4 }]);
    await act(async () => root.unmount());
  });

  it('reports nothing before the game document arrives — a click is not a play', async () => {
    const { fetchPublishedGame } = await import('./catalog');
    let release: (game: PublishedGame) => void = () => {};
    vi.mocked(fetchPublishedGame).mockReturnValue(new Promise((resolve) => (release = resolve)));

    const root = createRoot(container);
    await act(async () => {
      root.render(<PublishedGameFrame slug="space-hop" title="Space Hop" embed />);
    });

    expect(telemetryBodies(fetchSpy)).toHaveLength(0);

    await act(async () => {
      release({ slug: 'space-hop', title: 'Space Hop', html: '<html><body>game</body></html>' });
    });

    expect(payloads(telemetryBodies(fetchSpy)[0].events)).toEqual([{ type: 'game_opened' }]);
    await act(async () => root.unmount());
  });
});
