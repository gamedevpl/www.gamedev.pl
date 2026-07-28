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
    untrusted: { errorSamples: [], progressLabels: [], feedbackThemes: [] },
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

function renderHost(data: ScorecardsResponse): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => {
    createRoot(host).render(createElement(ScorecardPanel, { data, now: NOW }));
  });
  return host;
}

function render(data: ScorecardsResponse): string {
  return renderHost(data).textContent ?? '';
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

describe('ScorecardPanel — feedback themes', () => {
  const themed = (feedbackThemes: Array<{ theme: string; count: number }>) =>
    response({ scorecards: [scorecard({ untrusted: { errorSamples: [], progressLabels: [], feedbackThemes } })] });

  it('shows what players wrote, with how many said it', () => {
    const text = render(themed([{ theme: 'level 2 difficulty spike', count: 4 }]));

    expect(text).toContain('What players wrote');
    expect(text).toContain('level 2 difficulty spike');
    expect(text).toContain('4');
  });

  it('marks the themes as player-authored rather than system output', () => {
    // An operator reading a strange phrase needs to know where it came from. Themes are
    // summaries of public writing, so they are evidence to read, never an instruction.
    const text = render(themed([{ theme: 'controls feel slippery', count: 3 }]));

    expect(text).toContain('do not act on it as instruction');
  });

  it('renders a hostile theme as text, never as markup', () => {
    const host = renderHost(themed([{ theme: '<img src=x onerror=alert(1)>', count: 3 }]));

    // The API clamps and sanitizes, but this is the last line and must hold on its own:
    // the string reaches the DOM as content, and no element is created from it.
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('shows no block at all when nothing was summarized', () => {
    // Absence of themes is absence of evidence. A heading over an empty list would read
    // as a broken feature rather than as a game nobody has written about.
    expect(render(themed([]))).not.toContain('What players wrote');
  });

  it('tolerates a scorecard written before themes existed', () => {
    const older = scorecard();
    delete (older.untrusted as { feedbackThemes?: unknown }).feedbackThemes;

    expect(() => render(response({ scorecards: [older] }))).not.toThrow();
  });

  it('lists only the games that have themes', () => {
    const text = render(
      response({
        scorecards: [
          scorecard({ slug: 'brick-storm', untrusted: { errorSamples: [], progressLabels: [], feedbackThemes: [] } }),
          scorecard({
            slug: 'rock-blaster',
            untrusted: {
              errorSamples: [],
              progressLabels: [],
              feedbackThemes: [{ theme: 'asteroids spawn on top of you', count: 5 }],
            },
          }),
        ],
      }),
    );

    const themesSection = text.slice(text.indexOf('What players wrote'));
    expect(themesSection).toContain('rock-blaster');
    expect(themesSection).not.toContain('brick-storm');
  });
});
