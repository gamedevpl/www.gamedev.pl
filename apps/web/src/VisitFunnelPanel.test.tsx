// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { VisitFunnelPanel } from './VisitFunnelPanel.js';
import type { VisitFunnel, VisitsResponse } from './healthApi.js';

/**
 * Renders the operator funnel panel.
 *
 * The numbers here are the ones a launch decision gets made on, so the risk worth
 * testing is not that the component throws — it is that it renders a number that
 * silently means something other than its label claims.
 */

function funnel(overrides: Partial<VisitFunnel> = {}): VisitFunnel {
  return {
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
    creating: [],
    waitlist: [],
    ...overrides,
  };
}

function render(data: VisitsResponse): string {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(VisitFunnelPanel, { data }));
  });
  const text = host.textContent ?? '';
  // Unmount before the next case (or suite teardown) so React cannot commit after
  // jsdom has already torn `window` down — that surfaces as an unhandled
  // "window is not defined" with every assertion still green.
  act(() => {
    root.unmount();
  });
  host.remove();
  return text;
}

function response(overrides: Partial<VisitFunnel> = {}): VisitsResponse {
  return { days: ['2026-07-26'], truncated: false, funnel: funnel(overrides) };
}

describe('VisitFunnelPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('says so plainly when the window holds no visits', () => {
    expect(render(response())).toContain('No visits recorded');
  });

  it('reports the conversion rate as a share of visits, not of plays', () => {
    // 3 of 4 visits reached a game. A panel that divided by plays instead would show
    // 75% here too if plays happened to equal visits — so the fixture makes plays (5)
    // differ from playing visits (3) deliberately.
    const text = render(response({ visits: 4, visitsWithPlay: 3, bounces: 1, plays: 5 }));
    expect(text).toContain('75%');
    expect(text).toContain('reached a game');
  });

  it('shows dashes rather than a fake zero when nobody played', () => {
    const text = render(response({ visits: 5, bounces: 5, visitsWithPlay: 0 }));
    // A median of "0s to first play" would read as instant, which is the opposite of
    // what no data means.
    expect(text).not.toContain('0s');
    expect(text).toContain('—');
  });

  it('renders acquisition rows with their share of visits', () => {
    const text = render(
      response({
        visits: 4,
        visitsWithPlay: 1,
        plays: 1,
        referrers: [
          { referrer: 'news.ycombinator.com', visits: 3, plays: 1 },
          { referrer: 'direct', visits: 1, plays: 0 },
        ],
      }),
    );
    expect(text).toContain('news.ycombinator.com');
    expect(text).toContain('75%');
    expect(text).toContain('direct');
  });

  it('labels the time-to-play buckets in human units, including the overflow', () => {
    const text = render(
      response({
        visits: 3,
        visitsWithPlay: 3,
        plays: 3,
        timeToFirstPlay: [
          { upToSeconds: 30, visits: 1 },
          { upToSeconds: 180, visits: 1 },
          { upToSeconds: null, visits: 1 },
        ],
      }),
    );
    expect(text).toContain('≤ 30s');
    expect(text).toContain('≤ 3m');
    expect(text).toContain('slower');
  });

  it('shows campaigns only when some visit carried UTM values', () => {
    expect(render(response({ visits: 2 }))).not.toContain('Campaigns');

    const withCampaign = render(
      response({
        visits: 2,
        campaigns: [{ source: 'linkedin', campaign: 'beta', visits: 2, plays: 1 }],
      }),
    );
    expect(withCampaign).toContain('Campaigns');
    expect(withCampaign).toContain('linkedin / beta');
  });

  it('renders the depth table so a multi-game sitting is visible', () => {
    const text = render(
      response({
        visits: 2,
        visitsWithPlay: 2,
        plays: 4,
        medianPlaysPerPlayingVisit: 2,
        depth: [
          { plays: 1, visits: 1 },
          { plays: 3, visits: 1 },
        ],
      }),
    );
    expect(text).toContain('Games per visit');
    expect(text).toContain('median games / playing visit');
  });

  it('renders the waitlist funnel as a share of clicks, not of all visits', () => {
    const text = render(
      response({
        visits: 10,
        waitlist: [
          { step: 'cta_clicked', visits: 4 },
          { step: 'joined', visits: 2 },
        ],
      }),
    );
    expect(text).toContain('Waitlist');
    expect(text).toContain('clicked Join waitlist');
    expect(text).toContain('joined waitlist');
    // 2 of 4 clicks joined — 50%, not 20% of all visits.
    expect(text).toContain('50%');
  });

  it('says so when nobody touched the waitlist', () => {
    const text = render(
      response({
        visits: 3,
        waitlist: [
          { step: 'cta_clicked', visits: 0 },
          { step: 'joined', visits: 0 },
        ],
      }),
    );
    expect(text).toContain('Nobody clicked Join waitlist');
  });
});
