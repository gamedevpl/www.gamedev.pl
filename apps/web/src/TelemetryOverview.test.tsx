// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { TelemetryOverview } from './TelemetryOverview.js';
import type { CreatorsResponse, HealthResponse, VisitsResponse } from './healthApi.js';

/**
 * The overview is the glance layer: it must show the same rates the panels below
 * compute, and it must not invent a confident dial when a term is missing.
 */

function health(sessions = 12): HealthResponse {
  return {
    days: ['2026-08-06'],
    truncated: false,
    games: [
      {
        slug: 'demo',
        sessions,
        bounces: 0,
        closes: 0,
        medianPlaySeconds: 30,
        totalPlaySeconds: 300,
        errors: 0,
        errorSamples: [],
        aliveTicks: 0,
        stalledTicks: 0,
        stallRate: 0,
        medianFps: null,
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
      },
    ],
  };
}

function visits(overrides: Partial<VisitsResponse['funnel']> = {}): VisitsResponse {
  return {
    days: ['2026-08-06'],
    truncated: false,
    funnel: {
      visits: 100,
      bounces: 73,
      visitsWithPlay: 27,
      plays: 80,
      depth: [
        { plays: 1, visits: 10 },
        { plays: 2, visits: 8 },
        { plays: 3, visits: 9 },
      ],
      medianPlaysPerPlayingVisit: 3,
      timeToFirstPlay: [
        { upToSeconds: 10, visits: 15 },
        { upToSeconds: 30, visits: 8 },
        { upToSeconds: 60, visits: 4 },
      ],
      medianSecondsToFirstPlay: 8,
      entries: [],
      referrers: [],
      campaigns: [],
      creating: [
        { step: 'prompt_started', visits: 10 },
        { step: 'submission_created', visits: 1 },
      ],
      waitlist: [],
      editing: [],
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
      ...overrides,
    },
  };
}

function creators(overrides: Partial<CreatorsResponse['metrics']> = {}): CreatorsResponse {
  return {
    sampled: 5,
    metrics: {
      published: 3,
      eligibleForReturn: 2,
      returnedWithin7Days: 2,
      d7ReturnRate: 1,
      medianBuildMinutes: 620,
      p90BuildMinutes: 1965,
      creators: 3,
      gamesPerCreator: 4,
      ...overrides,
    },
  };
}

function render(props: { health: HealthResponse; visits: VisitsResponse; creators: CreatorsResponse }): string {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(TelemetryOverview, props));
  });
  const text = host.textContent ?? '';
  act(() => {
    root.unmount();
  });
  host.remove();
  return text;
}

describe('TelemetryOverview', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('puts the key rates and both distribution histograms on screen', () => {
    const text = render({ health: health(), visits: visits(), creators: creators() });
    expect(text).toContain('growth k');
    expect(text).toContain('reached a game');
    expect(text).toContain('27%');
    expect(text).toContain('played → submitted');
    expect(text).toContain('creator D7 return');
    expect(text).toContain('Time to first play');
    expect(text).toContain('Games per visit');
    expect(text).toContain('≤10s');
    expect(text).toContain('15');
  });

  it('dashes the gauges when a term has no evidence, rather than drawing a zero', () => {
    const text = render({
      health: health(0),
      visits: visits({
        visits: 0,
        visitsWithPlay: 0,
        bounces: 0,
        plays: 0,
        depth: [],
        timeToFirstPlay: [],
        creating: [],
      }),
      creators: creators({ d7ReturnRate: null, gamesPerCreator: null, published: 0 }),
    });
    expect(text).toContain('—');
    expect(text).toContain('No visits in this window.');
  });

  it('labels the time-to-play buckets in human units, including the overflow', () => {
    const text = render({
      health: health(),
      visits: visits({
        visits: 3,
        visitsWithPlay: 3,
        plays: 3,
        timeToFirstPlay: [
          { upToSeconds: 30, visits: 1 },
          { upToSeconds: 180, visits: 1 },
          { upToSeconds: null, visits: 1 },
        ],
      }),
      creators: creators(),
    });
    expect(text).toContain('≤30s');
    expect(text).toContain('≤3m');
    expect(text).toContain('slower');
  });
});
