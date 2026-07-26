// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n';
import { MyGamesRail } from './MyGamesRail';
import { getSubmissionStatus, listMySubmissions } from './submissionApi';

vi.mock('./submissionApi', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi')>('./submissionApi');
  return { ...actual, getSubmissionStatus: vi.fn(), listMySubmissions: vi.fn() };
});

const mockedListMySubmissions = vi.mocked(listMySubmissions);
const mockedGetSubmissionStatus = vi.mocked(getSubmissionStatus);

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderRail(container: HTMLElement, props: Partial<Parameters<typeof MyGamesRail>[0]> = {}) {
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(MyGamesRail, { onOpenStatus: vi.fn(), onPlayPublished: vi.fn(), ...props } as Parameters<
        typeof MyGamesRail
      >[0]),
    );
    await flushEffects();
    await flushEffects();
  });
  return root;
}

describe('MyGamesRail', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('lists the creator’s games from the server with their live status', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockedListMySubmissions.mockResolvedValue([
      {
        token: 'tok-a',
        title: 'Circus Cat',
        createdAt: '2026-01-02T00:00:00Z',
        lastKnownStatus: 'published',
        slug: 'circus-cat',
      },
      {
        token: 'tok-b',
        title: 'Space Runner',
        createdAt: '2026-01-01T00:00:00Z',
        lastKnownStatus: 'building',
        slug: null,
      },
    ]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = await renderRail(container);

    const cards = [...container.querySelectorAll('.my-game-card')].map((node) => node.textContent ?? '');
    // Newest first, rendered from the list alone.
    expect(cards).toHaveLength(2);
    expect(cards[0]).toContain('Circus Cat');
    expect(cards[0]).toContain('Live!');
    expect(cards[1]).toContain('Writing code');
    expect(container.textContent).toContain('1 in progress');
    // The whole rail is one request. Deriving a status per card is what rate-limited
    // the GitHub token and took the status page and catalog down with it.
    expect(mockedGetSubmissionStatus).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('falls back to locally saved specs when the API list is unavailable', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    localStorage.setItem(
      'gamedev_saved_specs',
      JSON.stringify([{ token: 'tok-local', title: 'Local Game', createdAt: Date.now() }]),
    );
    mockedListMySubmissions.mockRejectedValue(new Error('unauthorized'));
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'queued' });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = await renderRail(container);

    expect(container.textContent).toContain('Local Game');
    expect(container.textContent).toContain('In the queue');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders nothing when the creator has no games', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    mockedListMySubmissions.mockResolvedValue([]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = await renderRail(container);

    expect(container.querySelector('#my-games')).toBeNull();
    expect(mockedGetSubmissionStatus).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
