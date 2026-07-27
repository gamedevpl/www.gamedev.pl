// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { CreatorMetricsPanel } from './CreatorMetricsPanel.js';
import type { CreatorMetrics, CreatorsResponse } from './healthApi.js';

/**
 * The Stage 0 gate is a real decision made on the number this panel renders, so the
 * risk worth covering is a figure that reads as confident when it is not: a return rate
 * shown as 0% when it is simply too early to know.
 */

function response(metrics: Partial<CreatorMetrics> = {}, sampled = 10): CreatorsResponse {
  return {
    sampled,
    metrics: {
      published: 5,
      eligibleForReturn: 4,
      returnedWithin7Days: 1,
      d7ReturnRate: 0.25,
      medianBuildMinutes: 45,
      p90BuildMinutes: 200,
      creators: 3,
      gamesPerCreator: 5 / 3,
      ...metrics,
    },
  };
}

function render(data: CreatorsResponse): string {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => {
    createRoot(host).render(createElement(CreatorMetricsPanel, { data }));
  });
  return host.textContent ?? '';
}

describe('CreatorMetricsPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('says nothing has published rather than showing zeroes', () => {
    expect(render(response({ published: 0 }))).toContain('No games have published yet');
  });

  it('renders the D7 rate with the counts behind it', () => {
    const text = render(response());
    expect(text).toContain('25%');
    expect(text).toContain('came back within 7 days');
    expect(text).toContain('1 of 4 creators');
  });

  it('refuses to show a rate when no window has elapsed, instead of showing 0%', () => {
    // The failure that would matter: reporting 0% return on day one and concluding the
    // product has no retention, when nobody has had the chance to come back.
    //
    // Asserted against the value sitting next to its own label, not against "0%"
    // anywhere in the panel — the "slowest 10% of builds" label contains that substring
    // and made the looser version pass for the wrong reason.
    const text = render(response({ d7ReturnRate: null, eligibleForReturn: 0, returnedWithin7Days: 0 }));
    expect(text).toContain('—came back within 7 days');
    expect(text).toContain('not measurable');
  });

  it('formats build durations in hours once they get long', () => {
    const text = render(response({ medianBuildMinutes: 45, p90BuildMinutes: 200 }));
    expect(text).toContain('45m');
    expect(text).toContain('3h 20m');
  });

  it('shows a dash rather than a zero when a duration is unknown', () => {
    const text = render(response({ medianBuildMinutes: null, p90BuildMinutes: null }));
    expect(text).toContain('—');
  });
});
