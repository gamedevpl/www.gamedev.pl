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
    editing: [],
    cli: [],
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
    const text = render(response({ visits: 4, visitsWithPlay: 3, bounces: 1, plays: 5 }));
    expect(text).toContain('75%');
    expect(text).toContain('reached a game');
    expect(text).toContain('gamedevpl CLI');
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

  it('still reports median depth after the distribution charts moved to the overview', () => {
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
    expect(text).toContain('median games / playing visit');
    expect(text).toContain('2');
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

  it('renders the editing funnel as a share of openers, not of all visits', () => {
    const text = render(
      response({
        visits: 400,
        editing: [
          { step: 'opened', visits: 8 },
          { step: 'draft_saved', visits: 6 },
          { step: 'previewed', visits: 4 },
          { step: 'published', visits: 2 },
        ],
      }),
    );
    expect(text).toContain('Editing');
    expect(text).toContain('opened the editor');
    expect(text).toContain('published changes');
    // 2 of 8 openers published — 25%. Against all 400 visits it would round to 1%,
    // which is the number that makes an editing loop look dead when it is working.
    expect(text).toContain('25%');
  });

  it('says so when nobody opened an editor', () => {
    const text = render(
      response({
        visits: 3,
        editing: [
          { step: 'opened', visits: 0 },
          { step: 'draft_saved', visits: 0 },
          { step: 'previewed', visits: 0 },
          { step: 'published', visits: 0 },
        ],
      }),
    );
    expect(text).toContain('Nobody opened a game editor');
  });

  it('renders completion health and latency by lane', () => {
    const text = render(
      response({
        visits: 3,
        completion: {
          requests: 4,
          shown: 2,
          empty: 1,
          failed: 1,
          byKind: [
            {
              kind: 'language_service',
              requests: 2,
              shown: 1,
              empty: 1,
              failed: 0,
              medianLatencyMs: 150,
              p90LatencyMs: 200,
            },
            {
              kind: 'ghost_text',
              requests: 2,
              shown: 1,
              empty: 0,
              failed: 1,
              medianLatencyMs: 700,
              p90LatencyMs: 900,
            },
          ],
        },
      }),
    );
    expect(text).toContain('Code completion');
    expect(text).toContain('2 shown');
    expect(text).toContain('TypeScript');
    expect(text).toContain('150 ms');
    expect(text).toContain('Ghost text');
    expect(text).toContain('900 ms');
  });

  it('reports how-to-play open rate against playing visits, not against all visits', () => {
    // 2 of 4 playing visits opened. Dividing by all visits (10) would show 20% and
    // misread the question the block exists to answer.
    const text = render(
      response({
        visits: 10,
        visitsWithPlay: 4,
        plays: 6,
        howToPlay: {
          opens: 5,
          visits: 2,
          repeatVisits: 1,
          via: [
            { via: 'bar', opens: 4, visits: 2 },
            { via: 'more', opens: 1, visits: 1 },
          ],
          byEntry: [
            { entry: 'home', playingVisits: 100, visits: 1, opens: 3 },
            { entry: 'play', playingVisits: 2, visits: 1, opens: 2 },
          ],
        },
      }),
    );
    expect(text).toContain('How to play');
    expect(text).toContain('50% of playing visits opened');
    expect(text).toContain('theater bar');
    expect(text).toContain('More menu');
    expect(text).toContain('deep link (/play)');
    expect(text).toContain('catalog (home)');
    // 1 of 2 openers reopened the same card — 50%, not 10% of all visits.
    expect(text).toContain('50% reopened the same card');
    // byEntry rates: 1/100 home vs 1/2 play — not raw opener counts.
    expect(text).toContain('1%');
    expect(text).toContain('50%');
  });

  it('says so when nobody opened How to play', () => {
    const text = render(response({ visits: 3, visitsWithPlay: 2, plays: 2 }));
    expect(text).toContain('Nobody opened How to play');
  });

  it('renders plays by surface with each row against total plays', () => {
    // 3 of 10 plays came from the grid, not the total.
    const text = render(
      response({
        visits: 10,
        visitsWithPlay: 8,
        plays: 10,
        playVia: [
          { via: 'featured', plays: 4 },
          { via: 'rail_start_here', plays: 3 },
          { via: 'grid', plays: 3 },
        ],
      }),
    );
    expect(text).toContain('Plays by surface');
    expect(text).toContain('featured slot');
    expect(text).toContain('Start here rail');
    expect(text).toContain('catalog grid');
    expect(text).toContain('40%');
    expect(text).toContain('30%');
  });

  it('says so when nobody played, and tolerates a client that predates playVia', () => {
    const base = { visits: 5, visitsWithPlay: 0 };
    expect(render(response({ ...base, playVia: [] }))).toContain('Nobody played a game');
    expect(render(response({ ...base, playVia: undefined }))).toContain('Nobody played a game');
  });
});
