// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

const fetchCreatorPage = vi.fn();
let authUser: { uid: string; handle?: string; name?: string } | null = null;

vi.mock('./creatorProfileApi.js', () => ({
  fetchCreatorPage: (...args: unknown[]) => fetchCreatorPage(...args),
  fetchMyProfile: vi.fn(async () => ({
    profile: {
      handle: 'ada',
      profileName: 'Ada',
      bio: '',
      avatarUrl: null,
      profileCreatedAt: '2026-08-01T00:00:00.000Z',
    },
    publishReady: true,
    handle: 'ada',
    profileName: 'Ada',
    avatarMode: 'letter',
    picture: null,
  })),
  claimHandle: vi.fn(),
  updateMyProfile: vi.fn(),
  checkHandleAvailability: vi.fn(async () => ({ available: true })),
}));

vi.mock('./AuthContext.js', () => ({
  useAuth: () => ({ user: authUser, refreshUser: vi.fn(), logout: vi.fn() }),
}));

import { CreatorProfilePage } from './CreatorProfilePage.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  authUser = null;
  fetchCreatorPage.mockReset();
  fetchCreatorPage.mockResolvedValue({
    profile: {
      handle: 'ada',
      profileName: 'Ada',
      bio: 'Builder',
      avatarUrl: null,
      profileCreatedAt: '2026-08-01T00:00:00.000Z',
    },
    games: [],
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
  document.body.querySelectorAll('.claim-handle-modal-card, .modal-backdrop').forEach((node) => node.remove());
});

async function renderPage() {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(CreatorProfilePage, {
        handle: 'ada',
        onBack: vi.fn(),
        onPlay: vi.fn(),
        onNavigate: vi.fn(),
      }),
    );
  });
  await act(async () => {
    await fetchCreatorPage.mock.results[0]?.value;
    await Promise.resolve();
  });
}

describe('CreatorProfilePage owner edit', () => {
  it('hides Edit profile for visitors', async () => {
    authUser = { uid: 'g:other', handle: 'bob' };
    await renderPage();
    expect(container.textContent).not.toContain('Edit profile');
  });

  it('shows Edit profile for the owner and opens the modal', async () => {
    authUser = { uid: 'g:ada', handle: 'ada', name: 'Ada' };
    await renderPage();
    const edit = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Edit profile'),
    );
    expect(edit).toBeTruthy();
    await act(async () => {
      edit!.click();
      await Promise.resolve();
    });
    expect(document.body.querySelector('.edit-profile-modal-card')).not.toBeNull();
    expect(document.body.querySelector('.edit-profile-modal-card')?.textContent).toContain('Your public profile');
  });
});
