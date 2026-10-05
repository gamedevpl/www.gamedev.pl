// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { GameHealthView } from './GameHealthView.js';
import type {
  GameHealth,
  HealthResponse,
  VisitFunnel,
  VisitsResponse,
  CreatorsResponse,
  ScorecardsResponse,
} from './healthApi.js';

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
    outcomes: { won: 0, lost: 0, quit: 0 },
    sessionsWithEnding: 0,
    finishRate: 0,
    zoneAdmitted: 0,
    zoneJoined: 0,
    zoneJoinRate: null,
    winRate: null,
    medianBestScore: null,
    progressLabels: [],
    gfxBackends: { canvas2d: 0, webgl: 0, webgl3d: 0 },
    ...partial,
  };
}

const EMPTY_FUNNEL: VisitFunnel = {
  creating: [],
  waitlist: [],
  editing: [],
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
  howToPlay: {
    opens: 0,
    visits: 0,
    repeatVisits: 0,
    via: [
      { via: 'bar', opens: 0, visits: 0 },
      { via: 'more', opens: 0, visits: 0 },
    ],
    byEntry: [],
  },
};

const EMPTY_CREATORS: CreatorsResponse = {
  sampled: 0,
  metrics: {
    published: 0,
    eligibleForReturn: 0,
    returnedWithin7Days: 0,
    d7ReturnRate: null,
    medianBuildMinutes: null,
    p90BuildMinutes: null,
    creators: 0,
    gamesPerCreator: null,
  },
};

function respondWith(body: HealthResponse | null, status = 200, funnel?: VisitsResponse) {
  const visitsBody: VisitsResponse | null =
    body === null ? null : (funnel ?? { days: body.days, truncated: body.truncated, funnel: EMPTY_FUNNEL });
  const creatorsBody: CreatorsResponse | null = body === null ? null : EMPTY_CREATORS;
  const scorecardsBody: ScorecardsResponse | null =
    body === null ? null : { scorecards: [], newestComputedAt: null, oldestComputedAt: null };
  const trendsBody =
    body === null
      ? null
      : {
          days: [...body.days].reverse(),
          truncated: false,
          activity: [...body.days]
            .reverse()
            .map((date) => ({ date, visits: 0, plays: 0, creations: 0, truncated: false })),
          mcp: [...body.days].reverse().map((date) => ({
            date,
            selfChosen: 0,
            platformChosen: 0,
            connected: 0,
            signaled: 0,
            gateVerdicts: 0,
            truncated: false,
          })),
          retention: [...body.days]
            .reverse()
            .map((date) => ({ date, eligible: 0, returned: 0, rate: null as number | null })),
        };

  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    const payload = url.includes('/telemetry/visits')
      ? visitsBody
      : url.includes('/telemetry/creators')
        ? creatorsBody
        : url.includes('/telemetry/trends')
          ? trendsBody
          : url.includes('/admin/scorecards')
            ? scorecardsBody
            : body;
    return payload === null ? new Response(null, { status }) : new Response(JSON.stringify(payload), { status: 200 });
  }) as MockInstance<typeof globalThis.fetch>;
}

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

  async function render(view = 'Game health') {
    const root = createRoot(container);
    await act(async () => {
      root.render(<GameHealthView />);
    });
    if (view && container.querySelector('.operator-telemetry-nav'))
      await act(async () => {
        const button = [...container.querySelectorAll('.operator-telemetry-nav button')].find(
          (node) => node.textContent === view,
        );
        button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    return root;
  }

  it('opens the overview and switches views without rereading or mixing panels', async () => {
    const fetchSpy = respondWith({ days: ['2026-07-25'], truncated: false, games: [game({ slug: 'g' })] });
    const root = await render('');
    const requests = fetchSpy.mock.calls.length;
    expect(container.querySelector('#telemetry-overview')?.hasAttribute('hidden')).toBe(false);
    for (const name of ['Performance', 'Game health', 'Funnels', 'Creators', 'Trends', 'Overview']) {
      await act(async () => {
        [...container.querySelectorAll('.operator-telemetry-nav button')]
          .find((node) => node.textContent === name)!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const selected = container.querySelector('.operator-telemetry-nav [aria-pressed="true"]');
      expect(selected?.textContent).toBe(name);
      const visible = [...container.querySelectorAll('[id^="telemetry-"]')].filter(
        (node) => !node.hasAttribute('hidden'),
      );
      expect(visible).toHaveLength(1);
      expect(visible[0]?.id).toBe(selected?.getAttribute('aria-controls'));
    }
    expect(fetchSpy.mock.calls.length).toBe(requests);
    await act(async () => root.unmount());
  });

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

  it('shows how often a game gets finished and won', async () => {
    respondWith({
      days: ['2026-07-26'],
      truncated: false,
      games: [
        game({
          slug: 'brick-storm',
          sessions: 4,
          outcomes: { won: 3, lost: 9, quit: 0 },
          sessionsWithEnding: 2,
          finishRate: 0.5,
          winRate: 0.25,
          medianBestScore: 1200,
        }),
      ],
    });

    const root = await render();

    const text = container.textContent ?? '';
    expect(text).toContain('50%');
    expect(text).toContain('25%');
    expect(text).toContain('1200');
    expect(text).toContain('12 rounds finished');
    await act(async () => root.unmount());
  });

  it('renders a game that reports no endings as unknown, not as unfinished', async () => {
    respondWith({
      days: ['2026-07-26'],
      truncated: false,
      games: [game({ slug: 'quiet-game', sessions: 5 })],
    });

    const root = await render();

    const headers = [...container.querySelectorAll('th')].map((node) => node.textContent);
    const cells = [...container.querySelectorAll('tbody td')].map((node) => node.textContent);
    for (const column of ['Finished', 'Won', 'Best score']) {
      expect(cells[headers.indexOf(column)]).toBe('—');
    }

    const text = container.textContent ?? '';
    expect(text).toContain('reported no endings at all');
    expect(text).not.toContain('rounds finished');
    await act(async () => root.unmount());
  });

  it('lists progress landmarks behind a disclosure', async () => {
    respondWith({
      days: ['2026-07-26'],
      truncated: false,
      games: [
        game({
          slug: 'leveller',
          progressLabels: [
            { label: 'level-1', sessions: 9 },
            { label: 'level-2', sessions: 2 },
          ],
        }),
      ],
    });

    const root = await render();

    expect(container.textContent).toContain('level-2');
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
    const visitCalls = fetchSpy.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/telemetry/visits'));
    expect(visitCalls.some((url) => url.includes('days=30'))).toBe(true);
    await act(async () => root.unmount());
  });
});
