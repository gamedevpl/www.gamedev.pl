// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
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

import {
  CreatorProfileEditor,
  StudioCreatorProfileProvider,
  type CreatorProfileSurface,
} from './CreatorProfileEditor.js';

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

async function draw(surface: CreatorProfileSurface): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StudioCreatorProfileProvider>
        <CreatorProfileEditor surface={surface} />
      </StudioCreatorProfileProvider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function drawBoth(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StudioCreatorProfileProvider>
        <CreatorProfileEditor surface="chrome" />
        <CreatorProfileEditor surface="publish-gate" />
      </StudioCreatorProfileProvider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('CreatorProfileEditor', () => {
  it('renders nothing in chrome when the creator has no handle', async () => {
    profileApi.fetchMyProfile.mockResolvedValue({
      profile: null,
      publishReady: false,
      picture: null,
    });

    await draw('chrome');

    expect(container.textContent?.trim() ?? '').toBe('');
    expect(container.querySelector('.creator-profile-editor')).toBeNull();
  });

  it('shows the claim form on the publish gate when a handle is missing', async () => {
    profileApi.fetchMyProfile.mockResolvedValue({
      profile: null,
      publishReady: false,
      picture: null,
    });

    await draw('publish-gate');

    expect(container.textContent).toContain('Claim a handle to publish');
    expect(container.textContent).toContain('claim a handle so it can go live');
    expect(container.querySelector('.creator-profile-editor.is-publish-gate')).toBeTruthy();
    expect(container.querySelector('.creator-profile-preview')).toBeTruthy();
    expect(container.querySelector('button.primary-btn')?.textContent).toContain('Claim handle');
    expect(container.querySelectorAll('button.primary-btn')).toHaveLength(1);
  });

  it('hides the publish gate once a profile is publish-ready', async () => {
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

    await draw('publish-gate');

    expect(container.querySelector('.creator-profile-editor')).toBeNull();
  });

  it('collapses chrome to an @handle chip once a profile is publish-ready', async () => {
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

    await draw('chrome');

    expect(container.querySelector('.creator-profile-editor.is-collapsed')).toBeTruthy();
    expect(container.textContent).toContain('@ada');
    expect(container.textContent).toContain('Edit profile');
    expect(container.querySelector('button.primary-btn')).toBeNull();
  });

  it('opens the chrome editor from the chip without a second primary CTA', async () => {
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

    await draw('chrome');
    const chip = container.querySelector('.creator-profile-chip') as HTMLButtonElement;
    await act(async () => {
      chip.click();
    });

    expect(container.querySelector('.creator-profile-editor.is-expanded')).toBeTruthy();
    expect(container.querySelector('button.primary-btn')?.textContent).toContain('Save profile');
    expect(container.querySelector('details.creator-profile-rename')).toBeTruthy();
  });

  it('shows the chrome chip after a claim on the publish gate without remounting', async () => {
    profileApi.fetchMyProfile.mockResolvedValue({
      profile: null,
      publishReady: false,
      picture: null,
    });
    profileApi.claimHandle.mockResolvedValue({
      profile: {
        handle: 'ada',
        profileName: 'ada',
        bio: '',
        avatarUrl: null,
        profileCreatedAt: '2026-08-01T00:00:00.000Z',
      },
      publishReady: true,
      handle: 'ada',
      profileName: 'ada',
      avatarMode: 'letter',
      picture: null,
    });

    await drawBoth();
    expect(container.querySelector('.creator-profile-editor.is-publish-gate')).toBeTruthy();
    expect(container.querySelector('.creator-profile-editor.is-chrome')).toBeNull();

    const input = container.querySelector('.creator-profile-input') as HTMLInputElement;
    await act(async () => {
      // Simulate feeds the synthetic event into React's onChange; set the DOM value too
      // so a stale read of input.value cannot win.
      input.value = 'ada';
      Simulate.change(input);
    });

    await act(async () => {
      Simulate.submit(container.querySelector('form.creator-profile-form') as HTMLFormElement);
      await Promise.resolve();
    });

    expect(profileApi.claimHandle).toHaveBeenCalledWith('ada');
    expect(container.querySelector('.creator-profile-editor.is-publish-gate')).toBeNull();
    expect(container.querySelector('.creator-profile-editor.is-chrome')).toBeTruthy();
    expect(container.textContent).toContain('@ada');
    expect(container.textContent).toContain('Edit profile');
  });
});
