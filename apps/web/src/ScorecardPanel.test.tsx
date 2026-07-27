// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { ScorecardPanel } from './ScorecardPanel.js';
import type { Scorecard, ScorecardsResponse } from './healthApi.js';

/**
 * This panel is the only place a stopped sweep is visible — the game-health table beside
 * it recomputes on every open and so always looks current. The risks worth covering are
 * therefore about *honesty of absence*: an empty set that reads as "no games" instead of
 * "no job", a stale sweep that reads as fresh, and a null rate that reads as 0%.
 */

const NOW = Date.parse('2026-07-27T12:00:00.000Z');

function scorecard(partial: Partial<Scorecard> = {}): Scorecard {
  return {
    slug: 'brick-storm',
    computedAt: '2026-07-27T03:20:00.000Z',
    window: { days: ['2026-07-27'], truncated: false },
    sessions: { count: 12, bounces: 2, closes: 9, medianPlaySeconds: 40, totalPlaySeconds: 500 },
    health: { errors: 0, aliveTicks: 30, stalledTicks: 0, stallRate: 0, medianFps: 60, resumeTicksIgnored: 0 },
    depth: {
      outcomes: { won: 2, lost: 3, quit: 1 },
      sessionsWithEnding: 5,
      finishRate: 0.42,
      winRate: 0.4,
      medianBestScore: 120,
    },
    votes: { up: 3, down: 1 },
    feedback: { count: 2 },
    untrusted: { errorSamples: [], progressLabels: [] },
    ...partial,
  };
}

function response(partial: Partial<ScorecardsResponse> = {}): ScorecardsResponse {
  const scorecards = partial.scorecards ?? [scorecard()];
  return {
    scorecards,
    newestComputedAt: scorecards[0]?.computedAt ?? null,
    oldestComputedAt: scorecards[scorecards.length - 1]?.computedAt ?? null,
    ...partial,
  };
}

function render(data: ScorecardsResponse): string {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => {
    createRoot(host).render(createElement(ScorecardPanel, { data, now: NOW }));
  });
  return host.textContent ?? '';
}

describe('ScorecardPanel', () => {
  it('names the likely cause when nothing has been swept, rather than saying "no data"', () => {
    const text = render(response({ scorecards: [], newestComputedAt: null, oldestComputedAt: null }));
    // "No games" would be wrong and unactionable; the operator needs to know the job
    // may simply not exist.
    expect(text).toMatch(/scheduler job/i);
    expect(text).toMatch(/SCORECARD_SWEEP_AUDIENCE/);
  });

  it('flags a sweep that has stopped running', () => {
    // Three days old: the nightly job has missed at least two runs.
    const text = render(response({ scorecards: [scorecard({ computedAt: '2026-07-24T03:20:00.000Z' })] }));
    expect(text).toMatch(/stale/i);
    expect(text).toMatch(/likely\s+stopped running/i);
  });

  it('does not cry stale for a sweep that ran last night', () => {
    const text = render(response());
    expect(text).not.toMatch(/stale/i);
    expect(text).toContain('9h ago');
  });

  it('renders an unmeasured finish rate as — and never as 0%', () => {
    // A game that emitted no endings. Zero would assert "nobody finishes this", which
    // the data cannot support.
    const text = render(
      response({
        scorecards: [scorecard({ depth: { ...scorecard().depth, finishRate: null, winRate: null } })],
      }),
    );
    expect(text).toContain('—');
    expect(text).not.toContain('0%');
  });

  it('surfaces truncation so a floor is not read as a total', () => {
    const text = render(response({ scorecards: [scorecard({ window: { days: ['2026-07-27'], truncated: true } })] }));
    expect(text).toMatch(/floor rather than a total/i);
  });
});
