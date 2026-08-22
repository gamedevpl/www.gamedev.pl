// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatorStudioView } from './CreatorStudioView.js';
import i18n from './i18n/index.js';
import type { StudioGamesResponse } from './studioApi.js';
import { getSubmissionPreview, getSubmissionStatus } from './submissionApi.js';

/**
 * The site's full `GameTheater` — fullscreen, share, report — reachable from Studio's
 * strip, not only Studio's own lighter play posture. Isolated in its own file for the
 * same reason as CreatorStudioView.handoff.test.tsx: it needs its own submissionApi
 * mock shape (a resolvable `getSubmissionPreview`), which the broad
 * CreatorStudioView.test.tsx deliberately does not provide.
 */

const fetchStudioGames = vi.fn();
const fetchStudioHealth = vi.fn();
const fetchStudioScorecards = vi.fn();
const fetchStudioSuggestions = vi.fn();
let authUser: { uid: string; name: string } | null = null;

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: authUser, logout: vi.fn() }),
}));

vi.mock('./studioApi', async () => {
  const actual = await vi.importActual<typeof import('./studioApi.js')>('./studioApi.js');
  return {
    ...actual,
    fetchStudioGames: (...args: unknown[]) => fetchStudioGames(...args),
    fetchStudioHealth: (...args: unknown[]) => fetchStudioHealth(...args),
    fetchStudioScorecards: (...args: unknown[]) => fetchStudioScorecards(...args),
    fetchStudioSuggestions: (...args: unknown[]) => fetchStudioSuggestions(...args),
    submitImprovement: vi.fn(),
  };
});

vi.mock('./submissionApi', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi.js')>('./submissionApi.js');
  return {
    ...actual,
    getSubmissionStatus: vi.fn(),
    getSubmissionPreview: vi.fn(async () => {
      throw Object.assign(new Error('no preview'), { status: 409 });
    }),
    getChannelPlayable: vi.fn(async () => {
      throw Object.assign(new Error('no channel'), { status: 409 });
    }),
    abandonSubmission: vi.fn(),
  };
});

const mockedGetSubmissionStatus = vi.mocked(getSubmissionStatus);
const mockedGetSubmissionPreview = vi.mocked(getSubmissionPreview);

function studioShelf(games: Parameters<typeof fetchStudioGames>[0]): StudioGamesResponse {
  return { games, truncated: false, totalGames: games.length };
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('CreatorStudioView — open in theater', () => {
  beforeEach(() => {
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockReset();
    fetchStudioHealth.mockReset().mockResolvedValue({ days: [], truncated: false, games: [] });
    fetchStudioScorecards.mockReset().mockResolvedValue([]);
    fetchStudioSuggestions.mockReset().mockResolvedValue([]);
    mockedGetSubmissionStatus.mockReset();
    mockedGetSubmissionPreview.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens the draft in the full GameTheater — fullscreen chrome beyond the stage’s own play posture', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    fetchStudioGames.mockResolvedValue(
      studioShelf([
        {
          token: 'draft-token',
          title: 'Sky Dodge',
          createdAt: '2026-08-01T00:00:00.000Z',
          lastKnownStatus: 'building',
        },
      ]),
    );
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      preview: { slug: 'sky-dodge' },
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      html: '<!doctype html><html><head></head><body><canvas id="game">draft</canvas></body></html>',
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(CreatorStudioView, {
          selectedGame: 'draft-token',
          onNavigate: vi.fn(),
          onPlay: vi.fn(),
        }),
      );
    });
    await act(async () => {
      await fetchStudioGames.mock.results[0]?.value;
      await flushEffects();
      await flushEffects();
      await flushEffects();
    });

    const theaterButton = container.querySelector<HTMLButtonElement>('[aria-label="Open in theater"]');
    expect(theaterButton).not.toBeNull();
    expect(theaterButton!.disabled).toBe(false);
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      theaterButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const theater = container.querySelector('[role="dialog"]');
    expect(theater).not.toBeNull();
    expect(theater!.textContent).toContain('Sky Dodge');
    // A draft carries the wrench badge, not the "Playing" badge a published game gets.
    expect(theater!.textContent).toMatch(/draft/i);

    root.unmount();
  });
});
