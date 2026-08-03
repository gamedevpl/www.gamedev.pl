// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

const profileApi = vi.hoisted(() => ({
  fetchMyProfile: vi.fn(),
  claimHandle: vi.fn(),
  updateMyProfile: vi.fn(),
  checkHandleAvailability: vi.fn(),
}));

vi.mock('./creatorProfileApi.js', () => profileApi);

vi.mock('./AuthContext.js', () => ({
  useAuth: () => ({ refreshUser: vi.fn(), user: { uid: 'g:test' } }),
}));

import { CreatorProfileEditor } from './CreatorProfileEditor.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  profileApi.fetchMyProfile.mockReset();
  profileApi.claimHandle.mockReset();
  profileApi.updateMyProfile.mockReset();
  profileApi.checkHandleAvailability.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

async function draw(publishNudge = false): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(<CreatorProfileEditor publishNudge={publishNudge} />);
  });
  // Let the profile fetch settle.
  await act(async () => {
    await Promise.resolve();
  });
}

describe('CreatorProfileEditor', () => {
  it('expands the claim form when the creator has no handle', async () => {
    profileApi.fetchMyProfile.mockResolvedValue({
      profile: null,
      publishReady: false,
      picture: null,
    });

    await draw(true);

    expect(container.textContent).toContain('Claim a unique handle');
    expect(container.textContent).toContain('claim a handle so it can go live');
    expect(container.querySelector('.creator-profile-preview')).toBeTruthy();
    expect(container.querySelector('button.primary-btn')?.textContent).toContain('Claim handle');
    // One primary CTA — rename lives elsewhere after claim.
    expect(container.querySelectorAll('button.primary-btn')).toHaveLength(1);
  });

  it('collapses to an @handle chip once a profile is publish-ready', async () => {
    profileApi.fetchMyProfile.mockResolvedValue({
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
    });

    await draw();

    expect(container.querySelector('.creator-profile-editor.is-collapsed')).toBeTruthy();
    expect(container.textContent).toContain('@ada');
    expect(container.textContent).toContain('Edit profile');
    expect(container.querySelector('button.primary-btn')).toBeNull();
  });

  it('opens the editor from the chip without a second primary CTA in the thread', async () => {
    profileApi.fetchMyProfile.mockResolvedValue({
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
    });

    await draw();
    const chip = container.querySelector('.creator-profile-chip') as HTMLButtonElement;
    await act(async () => {
      chip.click();
    });

    expect(container.querySelector('.creator-profile-editor.is-expanded')).toBeTruthy();
    expect(container.querySelector('button.primary-btn')?.textContent).toContain('Save profile');
    // Rename is tucked under details, not a competing green button.
    expect(container.querySelector('details.creator-profile-rename')).toBeTruthy();
  });
});
