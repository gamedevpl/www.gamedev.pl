// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { GameHealthView } from './GameHealthView';
import type { GameHealth, HealthResponse, VisitFunnel, VisitsResponse } from './healthApi';

/**
 * The operator view's job is to make one thing obvious: which published game is broken.
 * These check that the numbers survive the trip to the screen, and — the part worth
 * guarding — that a non-admin is told nothing at all.
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

const EMPTY_FUNNEL: VisitFunnel = {
  creating: [],
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
};

/**
 * Answers both admin endpoints the view fetches in parallel.
 *
 * Two details this has to get right, both learned by getting them wrong. A `Response`
 * body is single-use, so every call needs a *freshly constructed* one — sharing one
 * instance makes the second `.json()` throw and the whole view fall into its error
 * state. And the two endpoints must be told apart by URL, since `Promise.all` means a
 * funnel payload answering the health request would fail just as silently.
 */
function respondWith(body: HealthResponse | null, status = 200, funnel?: VisitsResponse) {
  const visitsBody: VisitsResponse | null =
    body === null ? null : (funnel ?? { days: body.days, truncated: body.truncated, funnel: EMPTY_FUNNEL });

  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    const payload = url.includes('/telemetry/visits') ? visitsBody : body;
    return payload === null ? new Response(null, { status }) : new Response(JSON.stringify(payload), { status: 200 });
  }) as MockInstance<typeof globalThis.fetch>;
}

/** The health-endpoint calls only — the view also fetches the funnel on every window. */
function healthCalls(fetchSpy: MockInstance<typeof globalThis.fetch>) {
  return fetchSpy.mock.calls.map(([input]) => String(input)).filter((url) => url.includes('/telemetry/health'));
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
    expect(healthCalls(fetchSpy)[0]).toContain('days=7');

    const monthButton = [...container.querySelectorAll('button')].find((node) => node.textContent === '30d');
    await act(async () => {
      monthButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(healthCalls(fetchSpy)[1]).toContain('days=30');
    // Both panels share the window, so the funnel must follow it too — a 7-day funnel
    // above a 30-day table would be a quietly wrong page.
    const visitCalls = fetchSpy.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/telemetry/visits'));
    expect(visitCalls.some((url) => url.includes('days=30'))).toBe(true);
    await act(async () => root.unmount());
  });
});
