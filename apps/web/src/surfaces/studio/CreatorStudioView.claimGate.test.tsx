// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatorStudioView } from './CreatorStudioView.js';
import i18n from '../../i18n/index.js';
import type { StudioGame, StudioGamesResponse } from '../../studioApi.js';

const fetchStudioGames = vi.fn();
const fetchStudioHealth = vi.fn();
const fetchStudioScorecards = vi.fn();
const fetchStudioSuggestions = vi.fn();
let authUser: { uid: string; name: string; handle?: string } | null = null;

vi.mock('../../AuthContext', () => ({
  useAuth: () => ({ user: authUser, logout: vi.fn(), refreshUser: vi.fn() }),
}));

vi.mock('../../studioApi', async () => {
  const actual = await vi.importActual<typeof import('../../studioApi.js')>('../../studioApi.js');
  return {
    ...actual,
    fetchStudioGames: (...args: unknown[]) => fetchStudioGames(...args),
    fetchStudioHealth: (...args: unknown[]) => fetchStudioHealth(...args),
    fetchStudioScorecards: (...args: unknown[]) => fetchStudioScorecards(...args),
    fetchStudioSuggestions: (...args: unknown[]) => fetchStudioSuggestions(...args),
    submitImprovement: vi.fn(),
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
    abandonSubmission: vi.fn(),
  };
});

vi.mock('../../creatorProfileApi.js', () => ({
  fetchMyProfile: vi.fn(async () => ({ profile: null, publishReady: false, picture: null })),
  claimHandle: vi.fn(),
  updateMyProfile: vi.fn(),
  checkHandleAvailability: vi.fn(async () => ({ available: true })),
}));

function studioShelf(games: StudioGame[]): StudioGamesResponse {
  return { games, truncated: false, totalGames: games.length };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('CreatorStudioView claim-handle gate', () => {
  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:creator', name: 'Creator' };
    fetchStudioGames.mockReset();
    fetchStudioHealth.mockReset().mockResolvedValue({ days: [], truncated: false, games: [] });
    fetchStudioScorecards.mockReset().mockResolvedValue([]);
    fetchStudioSuggestions.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.querySelectorAll('.claim-handle-modal-card, .modal-backdrop').forEach((node) => node.remove());
    window.history.pushState(null, '', '/');
    vi.clearAllMocks();
  });

  async function renderInReview(handle?: string) {
    if (handle) authUser = { uid: 'g:creator', name: 'Creator', handle };
    fetchStudioGames.mockResolvedValue(
      studioShelf([
        {
          token: 'tok-review',
          title: 'Neon Drift',
          createdAt: '2026-08-01T00:00:00.000Z',
          lastKnownStatus: 'in_review',
          slug: 'neon-drift',
        },
      ]),
    );
    window.history.replaceState(null, '', '/studio/neon-drift');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(CreatorStudioView, {
          selectedGame: 'neon-drift',
          onNavigate: vi.fn(),
          onPlay: vi.fn(),
        }),
      );
    });
    await act(async () => {
      await fetchStudioGames.mock.results[0]?.value;
      await flush();
      await flush();
    });
    return { container, root };
  }

  it('shows Claim handle to publish when an in_review game has no handle', async () => {
    const { container, root } = await renderInReview();
    const cta = container.querySelector('.studio-head-action--claim') as HTMLButtonElement | null;
    expect(cta).not.toBeNull();
    expect(cta?.textContent).toContain('Claim a handle to publish');
    await act(async () => root.unmount());
  });

  it('hides the claim CTA once the creator already has a handle', async () => {
    const { container, root } = await renderInReview('ada');
    expect(container.querySelector('.studio-head-action--claim')).toBeNull();
    await act(async () => root.unmount());
  });

  it('opens the claim modal from the CTA', async () => {
    const { container, root } = await renderInReview();
    const cta = container.querySelector('.studio-head-action--claim') as HTMLButtonElement;
    await act(async () => {
      cta.click();
      await flush();
    });
    expect(document.body.querySelector('.claim-handle-modal-card')).not.toBeNull();
    expect(document.body.querySelector('.claim-handle-modal-card')?.textContent).toContain('Claim a handle to publish');
    await act(async () => root.unmount());
  });
});
