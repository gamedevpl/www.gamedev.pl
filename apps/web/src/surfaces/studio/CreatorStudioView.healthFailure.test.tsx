// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatorStudioView } from './CreatorStudioView.js';
import { StatsSection } from './StudioStatsSection.js';
import i18n from '../../i18n/index.js';
import type { StudioGame } from '../../studioApi.js';

const fetchStudioGames = vi.fn();
const fetchStudioHealth = vi.fn();

// A stable identity: the load effect is keyed on the user object.
const authUser = { uid: 'g:creator', name: 'Creator' };

vi.mock('../../AuthContext', () => ({
  useAuth: () => ({ user: authUser, logout: vi.fn(), refreshUser: vi.fn() }),
}));

vi.mock('../../studioApi', async () => {
  const actual = await vi.importActual<typeof import('../../studioApi.js')>('../../studioApi.js');
  return {
    ...actual,
    fetchStudioGames: (...args: unknown[]) => fetchStudioGames(...args),
    fetchStudioHealth: (...args: unknown[]) => fetchStudioHealth(...args),
    fetchStudioScorecards: vi.fn(async () => []),
    fetchStudioSuggestions: vi.fn(async () => []),
  };
});

vi.mock('../../submissionApi', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi.js')>('../../submissionApi.js');
  return {
    ...actual,
    getSubmissionStatus: vi.fn(async () => ({ status: 'in_review', phase: 'ready_for_review', builder: 'self' })),
    getSubmissionPreview: vi.fn(async () => {
      throw Object.assign(new Error('no preview'), { status: 409 });
    }),
    getChannelPlayable: vi.fn(async () => {
      throw Object.assign(new Error('no channel'), { status: 409 });
    }),
  };
});

vi.mock('../../creatorProfileApi.js', () => ({
  fetchMyProfile: vi.fn(async () => ({ profile: null, publishReady: false, picture: null })),
  claimHandle: vi.fn(),
  updateMyProfile: vi.fn(),
  checkHandleAvailability: vi.fn(async () => ({ available: true })),
}));

const game: StudioGame = {
  token: 'tok-live',
  title: 'Neon Drift',
  createdAt: '2026-08-01T00:00:00.000Z',
  lastKnownStatus: 'in_review',
  slug: 'neon-drift',
};

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('CreatorStudioView when the health read fails', () => {
  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    fetchStudioGames.mockReset().mockResolvedValue({ games: [game], truncated: false, totalGames: 1 });
    fetchStudioHealth.mockReset().mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('still renders the shelf after a 429 from health', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(CreatorStudioView, { selectedGame: 'neon-drift', onNavigate: vi.fn(), onPlay: vi.fn() }),
      );
    });
    await act(async () => {
      await flush();
      await flush();
    });

    expect(fetchStudioHealth).toHaveBeenCalled();
    expect(container.textContent).toContain('Neon Drift');
    expect(container.textContent).not.toContain(i18n.t('studioPanel.loadError'));
    await act(async () => root.unmount());
  });

  it('labels stats unavailable rather than empty', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(StatsSection, {
          game,
          health: null,
          days: 7,
          healthDays: null,
          truncated: false,
          scorecard: null,
          onDaysChange: vi.fn(),
        }),
      );
    });

    expect(container.textContent).toContain(i18n.t('studioPanel.stats.unavailable'));
    expect(container.textContent).not.toContain(i18n.t('studioPanel.stats.empty'));
    await act(async () => root.unmount());
  });
});
