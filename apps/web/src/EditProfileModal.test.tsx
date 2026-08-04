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
const deleteAccount = vi.hoisted(() => vi.fn());

vi.mock('./creatorProfileApi.js', () => profileApi);

vi.mock('./AuthContext.js', () => ({
  useAuth: () => ({ refreshUser: vi.fn(), deleteAccount, user: { uid: 'g:test', handle: 'ada' } }),
}));

import { ClaimHandleModal } from './ClaimHandleModal.js';
import { EditProfileModal } from './EditProfileModal.js';
import { StudioCreatorProfileProvider } from './studioCreatorProfile.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  profileApi.fetchMyProfile.mockReset();
  profileApi.claimHandle.mockReset();
  profileApi.updateMyProfile.mockReset();
  profileApi.checkHandleAvailability.mockReset();
  deleteAccount.mockReset();
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

const readyProfile = {
  profile: {
    handle: 'ada',
    profileName: 'Ada',
    bio: 'hi',
    avatarUrl: null,
    profileCreatedAt: '2026-08-01T00:00:00.000Z',
  },
  publishReady: true,
  handle: 'ada',
  profileName: 'Ada',
  bio: 'hi',
  avatarMode: 'letter' as const,
  picture: null,
};

describe('EditProfileModal', () => {
  it('opens the edit form in a modal', async () => {
    profileApi.fetchMyProfile.mockResolvedValue(readyProfile);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <StudioCreatorProfileProvider>
          <EditProfileModal isOpen onClose={() => undefined} />
        </StudioCreatorProfileProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const dialog = document.body.querySelector('.edit-profile-modal-card');
    expect(dialog?.textContent).toContain('Your public profile');
    expect(dialog?.querySelector('button.primary-btn')?.textContent).toContain('Save profile');
    expect(dialog?.querySelector('details.creator-profile-rename')).toBeTruthy();
  });

  it('closes on Escape from a focused field inside the dialog', async () => {
    profileApi.fetchMyProfile.mockResolvedValue(readyProfile);
    let open = true;
    root = createRoot(container);
    const render = () => {
      root!.render(
        <StudioCreatorProfileProvider>
          <EditProfileModal
            isOpen={open}
            onClose={() => {
              open = false;
            }}
          />
        </StudioCreatorProfileProvider>,
      );
    };
    await act(async () => {
      render();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const nameInput = document.body.querySelector(
      '.edit-profile-modal-card input.creator-profile-input',
    ) as HTMLInputElement;
    await act(async () => {
      nameInput.focus();
      nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      render();
      await Promise.resolve();
    });
    expect(open).toBe(false);
  });

  it('keeps focus in the name field while typing', async () => {
    profileApi.fetchMyProfile.mockResolvedValue(readyProfile);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <StudioCreatorProfileProvider>
          <EditProfileModal isOpen onClose={() => undefined} />
        </StudioCreatorProfileProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const nameInput = document.body.querySelector(
      '.edit-profile-modal-card input.creator-profile-input',
    ) as HTMLInputElement;
    await act(async () => {
      nameInput.focus();
      nameInput.value = 'Ada';
      Simulate.change(nameInput);
    });
    expect(document.activeElement).toBe(nameInput);
  });

  it('saves details and notifies the parent', async () => {
    profileApi.fetchMyProfile.mockResolvedValue(readyProfile);
    profileApi.updateMyProfile.mockResolvedValue({
      ...readyProfile,
      profileName: 'Ada Lovelace',
      profile: { ...readyProfile.profile, profileName: 'Ada Lovelace' },
    });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <StudioCreatorProfileProvider>
          <EditProfileModal isOpen onClose={onClose} onSaved={onSaved} />
        </StudioCreatorProfileProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const nameInput = document.body.querySelector(
      '.edit-profile-modal-card input.creator-profile-input',
    ) as HTMLInputElement;
    await act(async () => {
      nameInput.value = 'Ada Lovelace';
      Simulate.change(nameInput);
    });
    await act(async () => {
      Simulate.submit(document.body.querySelector('.edit-profile-modal-card form') as HTMLFormElement);
      await Promise.resolve();
    });

    expect(profileApi.updateMyProfile).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('requires an explicit DELETE confirmation before account deletion', async () => {
    profileApi.fetchMyProfile.mockResolvedValue(readyProfile);
    deleteAccount.mockResolvedValue({ publishedGamesKept: [], unpublishedGamesRemoved: [] });
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <StudioCreatorProfileProvider>
          <EditProfileModal isOpen onClose={() => undefined} />
        </StudioCreatorProfileProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      Simulate.click(document.body.querySelector('.creator-profile-delete-button') as HTMLButtonElement);
    });
    const dialog = document.body.querySelector('.account-delete-dialog');
    const confirm = dialog?.querySelector('.creator-profile-delete-confirm') as HTMLButtonElement;
    expect(dialog?.textContent).toContain('Published games stay playable');
    expect(confirm.disabled).toBe(true);

    const input = dialog?.querySelector('input') as HTMLInputElement;
    input.value = 'DELETE';
    act(() => {
      Simulate.change(input);
    });
    expect(confirm.disabled).toBe(false);
  });
});

describe('ClaimHandleModal', () => {
  it('shows the claim form in a modal when open and a handle is missing', async () => {
    profileApi.fetchMyProfile.mockResolvedValue({
      profile: null,
      publishReady: false,
      picture: null,
    });

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <StudioCreatorProfileProvider>
          <ClaimHandleModal isOpen onClose={() => undefined} />
        </StudioCreatorProfileProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const dialog = document.body.querySelector('.claim-handle-modal-card');
    expect(dialog?.textContent).toContain('Claim a handle to publish');
    expect(dialog?.querySelector('button.primary-btn')?.textContent).toContain('Claim handle');
  });

  it('closes the claim modal after a successful claim', async () => {
    profileApi.fetchMyProfile.mockResolvedValue({
      profile: null,
      publishReady: false,
      picture: null,
    });
    profileApi.claimHandle.mockResolvedValue(readyProfile);
    const onClose = vi.fn();

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <StudioCreatorProfileProvider>
          <ClaimHandleModal isOpen onClose={onClose} />
        </StudioCreatorProfileProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const input = document.body.querySelector('.claim-handle-modal-card .creator-profile-input') as HTMLInputElement;
    await act(async () => {
      input.value = 'ada';
      Simulate.change(input);
    });
    await act(async () => {
      Simulate.submit(document.body.querySelector('.claim-handle-modal-card form') as HTMLFormElement);
      await Promise.resolve();
    });

    expect(profileApi.claimHandle).toHaveBeenCalledWith('ada');
    // ClaimHandleModal auto-closes when publishReady flips true.
    expect(onClose).toHaveBeenCalled();
  });
});
