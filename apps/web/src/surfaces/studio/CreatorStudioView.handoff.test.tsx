// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatorStudioView } from './CreatorStudioView.js';
import i18n from '../../i18n/index.js';
import type { StudioGame, StudioGamesResponse } from '../../studioApi.js';
import { getSubmissionStatus } from '../../submissionApi.js';
import { submitImprovement } from '../../studioApi.js';

/**
 * The studio-side half of the publish→improve handoff (BY-20): when the embedded build
 * thread reports that a published-game improvement opened a new job, CreatorStudioView
 * must move the open thread onto that new job — even though it is not on the shelf yet —
 * rather than leaving the creator on the published (terminal) thread.
 *
 * Isolated in its own file because it mocks submissionApi and stubs global fetch, which
 * the broad CreatorStudioView.test.tsx deliberately does not.
 */

const fetchStudioGames = vi.fn();
const fetchStudioHealth = vi.fn();
const fetchStudioScorecards = vi.fn();
const fetchStudioSuggestions = vi.fn();
let authUser: { uid: string; name: string } | null = null;

vi.mock('../../AuthContext', () => ({
  useAuth: () => ({ user: authUser, logout: vi.fn() }),
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
const mockedSubmitImprovement = vi.mocked(submitImprovement);

function studioShelf(games: StudioGame[], truncated = false, totalGames?: number): StudioGamesResponse {
  return { games, truncated, totalGames: totalGames ?? games.length };
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('CreatorStudioView publish→improve handoff', () => {
  beforeEach(() => {
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockReset();
    fetchStudioHealth.mockReset().mockResolvedValue({ days: [], truncated: false, games: [] });
    fetchStudioScorecards.mockReset().mockResolvedValue([]);
    fetchStudioSuggestions.mockReset().mockResolvedValue([]);
    mockedGetSubmissionStatus.mockReset();
    mockedSubmitImprovement.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('moves the open thread onto the new self job and shows its connect card', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const connectFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        installSnippets: {
          claudeCode: 'claude mcp add gamedevpl https://example.test/api/mcp',
          codex: 'url = "https://example.test/api/mcp"',
          cursor: '{"mcpServers":{}}',
          kimi: 'npx mcp-remote https://example.test/api/mcp',
          cli: 'curl https://example.test/api/mcp',
        },
        installLinks: {
          cursor:
            'cursor://anysphere.cursor-deeplink/mcp/install?name=gamedevpl&config=' +
            btoa(JSON.stringify({ url: 'https://example.test/api/mcp' })),
          vscode: `vscode:mcp/install?${encodeURIComponent(
            JSON.stringify({ name: 'gamedevpl', type: 'http', url: 'https://example.test/api/mcp' }),
          )}`,
        },
        kickoffPrompt:
          'Build "TV Tycoon" for gamedev.pl.\nStart with the gamedevpl tool, slug: tv-tycoon.\nstart returns your workflow; after gate green the round is done.',
        mcpUrl: 'https://example.test/api/mcp',
        authorizationHeader: 'Authorization: Bearer test-key-not-for-display',
        authorizationHeaderMasked: 'Authorization: Bearer ····play',
        fingerprint: 'play',
        keyGeneration: 1,
        slug: 'tv-tycoon',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    }));
    vi.stubGlobal('fetch', connectFetch);

    fetchStudioGames.mockResolvedValue(
      studioShelf([
        {
          token: 'pub-self-shelf',
          title: 'TV Tycoon',
          createdAt: '2026-07-01T00:00:00.000Z',
          lastKnownStatus: 'published',
          slug: 'tv-tycoon',
          publishedAt: '2026-07-01T00:00:00.000Z',
        },
      ]),
    );

    // The published (terminal) thread is self-built; its improvement is a new self job
    // still waiting on the creator's own agent — the state that renders the connect card.
    mockedGetSubmissionStatus.mockImplementation(async (token: string) =>
      token === 'new-self-job'
        ? { status: 'queued', stall: 'no_agent_yet', builder: 'self' }
        : { status: 'published', slug: 'tv-tycoon', defaultBuilder: 'self' },
    );
    mockedSubmitImprovement.mockResolvedValue({ ok: true, jobId: 77, token: 'new-self-job', slug: 'tv-tycoon' });

    window.history.replaceState(null, '', '/studio/tv-tycoon');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          createElement(CreatorStudioView, {
            selectedGame: 'tv-tycoon',
            onNavigate: vi.fn(),
            onPlay: vi.fn(),
          }),
        );
      });
      await act(async () => {
        await fetchStudioGames.mock.results[0]?.value;
        await flushEffects();
        await flushEffects();
      });

      // Terminal published thread: no connect card of its own.
      expect(container.querySelector('.studio-thread')).not.toBeNull();
      expect(container.querySelector('.studio-connect')).toBeNull();

      const box = container.querySelector<HTMLTextAreaElement>('.status-feedback-input');
      expect(box).not.toBeNull();
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(box, 'Give the second level a checkpoint so it is not so punishing.');
        box!.dispatchEvent(new Event('input', { bubbles: true }));
        await flushEffects();
      });
      await act(async () => {
        container.querySelector('.status-composer-send')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
        await flushEffects();
        await flushEffects();
      });

      // The improvement was filed against the published job's token, defaulting to the
      // status payload's builder (self) rather than empty local memory.
      expect(mockedSubmitImprovement).toHaveBeenCalledWith('pub-self-shelf', expect.any(String), undefined, 'self');
      // The thread is now the new job's: it announces the handoff and shows that round's
      // connect card. The published thread never surfaced either.
      expect(container.querySelector('.status-handoff-notice')?.textContent).toContain('new build thread');
      expect(container.querySelector('.studio-connect')).not.toBeNull();
      expect(connectFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/submissions/new-self-job/connect'),
        expect.objectContaining({ credentials: 'include' }),
      );

      // Play must follow the handoff token too — otherwise pause-feedback would
      // call submitImprovement on the published job and open a second concurrent round.
      // The stage is a posture now, not a separate panel with its own fetch: it is
      // always mounted on whichever token the thread is on, so what proves the handoff
      // followed is that its status poll reads the new job's token continuously, not
      // the published shelf token, once the handoff has happened.
      expect(mockedGetSubmissionStatus).toHaveBeenCalledWith('new-self-job', expect.any(String));
      mockedGetSubmissionStatus.mockClear();
      await act(async () => {
        const playTab = Array.from(container.querySelectorAll('.studio-head-action.is-primary')).find(Boolean);
        expect(playTab).toBeTruthy();
        playTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
        await flushEffects();
      });
      expect(mockedGetSubmissionStatus).not.toHaveBeenCalledWith('pub-self-shelf');

      // Back to thread, then Details → Media must poll the handoff job — not the
      // published shelf token — or toast shots from the new round are missing.
      await act(async () => {
        const playTab = Array.from(container.querySelectorAll('.studio-head-action.is-primary')).find(Boolean);
        playTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
      mockedGetSubmissionStatus.mockClear();
      mockedGetSubmissionStatus.mockImplementation(async (token: string) =>
        token === 'new-self-job'
          ? {
              status: 'queued',
              stall: 'no_agent_yet',
              builder: 'self',
              media: [{ source: 'channel', ref: 'shot-1', label: 'New round' }],
            }
          : { status: 'published', slug: 'tv-tycoon', media: [{ source: 'channel', ref: 'old', label: 'Old' }] },
      );
      await act(async () => {
        const details = Array.from(container.querySelectorAll('.studio-head-action')).find((button) =>
          button.textContent?.includes('Details'),
        );
        details!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
        await flushEffects();
      });
      await act(async () => {
        container
          .querySelector('[data-testid="studio-rail-icon-media"]')!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
        await flushEffects();
      });
      expect(mockedGetSubmissionStatus).toHaveBeenCalledWith('new-self-job', expect.anything());
      expect(container.querySelector('[data-testid="studio-details-media"]')).not.toBeNull();
      expect(container.textContent).toContain('New round');
      expect(container.textContent).not.toContain('Old');

      // Build must be reachable too: `game` here is still the published shelf entry
      // (lastKnownStatus published), which alone would hide the pane entirely and, if
      // shown, poll the wrong (published) token — see the Codex finding on #1011.
      expect(container.querySelector('[data-testid="studio-rail-icon-build"]')).not.toBeNull();
      mockedGetSubmissionStatus.mockClear();
      await act(async () => {
        container
          .querySelector('[data-testid="studio-rail-icon-build"]')!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
        await flushEffects();
      });
      expect(mockedGetSubmissionStatus).toHaveBeenCalledWith('new-self-job', expect.anything());
      expect(mockedGetSubmissionStatus).not.toHaveBeenCalledWith('pub-self-shelf', expect.anything());
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});
