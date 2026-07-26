// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { GameHealthView } from './GameHealthView';
import type { GameHealth, HealthResponse, VisitsResponse } from './healthApi';

/**
 * The operator view's job is to make one thing obvious: which published game is broken.
 * These check that the numbers survive the trip to the screen, and — the part worth
 * guarding — that a non-admin is told nothing at all.
 *
 * The view fetches health and the visit funnel together (same window). The mock must
 * answer both URLs with a fresh Response each time: a single shared body stream is
 * consumed by the first reader and leaves the sibling call failing closed.
 */

function game(partial: Partial<GameHealth> & { slug: string }): GameHealth {
  return {
    sessions: 1,
    bounces: 0,
    closes: 1,
    medianPlaySeconds: 60,
    totalPlaySeconds: 60,
    errors: 0,
    errorSamples: [],
    aliveTicks: 12,
    stalledTicks: 0,
    stallRate: 0,
    medianFps: 60,
    resumeTicksIgnored: 0,
    ...partial,
  };
}

/** Empty funnel shaped like the API — enough for VisitFunnelPanel to render quietly. */
function emptyVisits(days: string[]): VisitsResponse {
  return {
    days,
    truncated: false,
    funnel: {
      visits: 0,
      bounces: 0,
      visitsWithPlay: 0,
      plays: 0,
      depth: [],
      medianPlaysPerPlayingVisit: 0,
      timeToFirstPlay: [],
      medianSecondsToFirstPlay: 0,
      entries: [],
      referrers: [],
      campaigns: [],
    },
  };
}

function respondWith(body: HealthResponse | null, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    // A non-admin gets the same 404 from every telemetry route — both halves fail closed.
    if (body === null) {
      return new Response(null, { status });
    }
    if (url.includes('/api/admin/telemetry/visits')) {
      return new Response(JSON.stringify(emptyVisits(body.days)), { status: 200 });
    }
    return new Response(JSON.stringify(body), { status: 200 });
  }) as MockInstance<typeof globalThis.fetch>;
}

describe('GameHealthView', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
  });

  async function render() {
    const root = createRoot(container);
    await act(async () => {
      root.render(<GameHealthView />);
    });
    return root;
  }

  it('shows each game with its play and health numbers', async () => {
    respondWith({
      days: ['2026-07-25', '2026-07-24'],
      truncated: false,
      games: [game({ slug: 'brick-storm', sessions: 3, medianPlaySeconds: 90 })],
    });

    const root = await render();

    const text = container.textContent ?? '';
    expect(text).toContain('brick-storm');
    expect(text).toContain('1m 30s');
    expect(text).toContain('ok');
    // The window actually scanned is stated, so a number is never read out of context.
    expect(text).toContain('2026-07-24 → 2026-07-25');
    await act(async () => root.unmount());
  });

  it('flags an erroring game and lists its messages behind a disclosure', async () => {
    respondWith({
      days: ['2026-07-25'],
      truncated: false,
      games: [
        game({
          slug: 'buggy-game',
          errors: 4,
          errorSamples: [{ message: 'x is not a function', count: 4 }],
        }),
      ],
    });

    const root = await render();

    expect(container.textContent).toContain('errors');
    expect(container.textContent).toContain('x is not a function');
    await act(async () => root.unmount());
  });

  it('says nothing at all to a caller the API does not recognise', async () => {
    // 404 is what the API answers a non-admin; the view must not hint otherwise.
    respondWith(null, 404);

    const root = await render();

    expect(container.textContent).toBe('Not found.');
    expect(container.textContent).not.toContain('health');
    await act(async () => root.unmount());
  });

  it('reports an empty window as empty rather than as a failure', async () => {
    respondWith({ days: ['2026-07-25'], truncated: false, games: [] });

    const root = await render();

    expect(container.textContent).toContain('No play recorded');
    await act(async () => root.unmount());
  });

  it('warns that counts are a floor when a partition hit the read cap', async () => {
    respondWith({ days: ['2026-07-25'], truncated: true, games: [game({ slug: 'g' })] });

    const root = await render();

    expect(container.textContent).toContain('floor');
    await act(async () => root.unmount());
  });

  it('surfaces discarded resume ticks rather than hiding the adjustment', async () => {
    respondWith({
      days: ['2026-07-25'],
      truncated: false,
      games: [game({ slug: 'slept', resumeTicksIgnored: 3 })],
    });

    const root = await render();

    expect(container.textContent).toContain('3 discarded');
    await act(async () => root.unmount());
  });

  it('refetches when the window changes', async () => {
    const fetchSpy = respondWith({ days: ['2026-07-25'], truncated: false, games: [] });

    const root = await render();
    // Both panels load together for the default window.
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('health?days=7'))).toBe(true);
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('visits?days=7'))).toBe(true);

    const monthButton = [...container.querySelectorAll('button')].find((node) => node.textContent === '30d');
    await act(async () => {
      monthButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('health?days=30'))).toBe(true);
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('visits?days=30'))).toBe(true);
    await act(async () => root.unmount());
  });
});
