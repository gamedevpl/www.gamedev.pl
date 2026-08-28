// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

const connectApi = vi.hoisted(() => ({
  getCreatorAgentKey: vi.fn(),
  mintCreatorAgentKey: vi.fn(),
  rotateCreatorAgentKey: vi.fn(),
  revokeCreatorAgentKey: vi.fn(),
  listOAuthGrants: vi.fn(),
  revokeOAuthGrant: vi.fn(),
}));

vi.mock('./surfaces/studio/connectApi.js', () => connectApi);

vi.mock('./AuthContext.js', () => ({
  useAuth: () => ({ deleteAccount: vi.fn(), user: { uid: 'g:test', handle: null } }),
}));

const { AccountSettingsModal } = await import('./AccountSettingsModal.js');

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('AccountSettingsModal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    connectApi.getCreatorAgentKey.mockResolvedValue({
      key: 'ck_live_secret',
      keyGeneration: 1,
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
      fingerprint: '9a10e',
      authorizationHeader: 'Authorization: Bearer ck_live_secret',
      authorizationHeaderMasked: 'Authorization: Bearer ····9a10e',
      revoked: false,
    });
    connectApi.listOAuthGrants.mockResolvedValue([
      {
        grantId: 'grant-111111',
        clientId: 'chatgpt',
        clientLabel: 'chatgpt.com',
        createdAt: '2026-08-03T15:40:00.000Z',
        lastUsedAt: null,
      },
    ]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.querySelectorAll('.modal-backdrop').forEach((node) => node.remove());
    vi.clearAllMocks();
  });

  it('offers the coding-agent key and connected agents alongside account deletion', async () => {
    await act(async () => {
      root.render(createElement(AccountSettingsModal, { isOpen: true, onClose: () => {} }));
      await flush();
    });

    const card = document.body.querySelector('.account-settings-modal-card');
    expect(card).not.toBeNull();
    expect(card?.querySelector('[data-testid="creator-key-masked"]')?.textContent).toBe(
      'Authorization: Bearer ····9a10e',
    );
    expect(card?.innerHTML).not.toContain('ck_live_secret');
    expect(card?.querySelectorAll('.studio-oauth-client-row')).toHaveLength(1);
    expect(card?.textContent).toContain('Connection 111111');
  });

  const navItem = (section: string) =>
    document.body.querySelector(`.account-settings-nav-item[data-section="${section}"]`) as
      HTMLButtonElement | undefined;
  const panel = (section: string) =>
    document.body.querySelector(`.account-settings-panel[data-section="${section}"]`) as HTMLElement | undefined;

  it('lists Account before Credentials, but still opens on Credentials', async () => {
    await act(async () => {
      root.render(createElement(AccountSettingsModal, { isOpen: true, onClose: () => {} }));
      await flush();
    });

    const order = [...document.body.querySelectorAll('.account-settings-nav-item')].map((el) =>
      el.getAttribute('data-section'),
    );
    expect(order).toEqual(['account', 'credentials']);
    expect(panel('credentials')?.hidden).toBe(false);
  });

  it('switches to the Account section and hides — but keeps — the credentials panel', async () => {
    await act(async () => {
      root.render(createElement(AccountSettingsModal, { isOpen: true, onClose: () => {} }));
      await flush();
    });

    await act(async () => {
      navItem('account')?.click();
      await flush();
    });

    expect(panel('credentials')?.hidden).toBe(true);
    expect(panel('account')?.hidden).toBe(false);
    expect(panel('account')?.textContent).toContain('Schedule account deletion');
    expect(navItem('account')?.getAttribute('aria-current')).toBe('true');
    expect(navItem('credentials')?.getAttribute('aria-current')).toBeNull();
  });

  it('does not refetch credentials when the creator switches back', async () => {
    await act(async () => {
      root.render(createElement(AccountSettingsModal, { isOpen: true, onClose: () => {} }));
      await flush();
    });
    expect(connectApi.getCreatorAgentKey).toHaveBeenCalledTimes(1);

    await act(async () => {
      navItem('account')?.click();
      await flush();
    });
    await act(async () => {
      navItem('credentials')?.click();
      await flush();
    });

    expect(connectApi.getCreatorAgentKey).toHaveBeenCalledTimes(1);
    expect(connectApi.listOAuthGrants).toHaveBeenCalledTimes(1);
  });

  it('reopens on Credentials even after closing on Account', async () => {
    const render = (isOpen: boolean) =>
      act(async () => {
        root.render(createElement(AccountSettingsModal, { isOpen, onClose: () => {} }));
        await flush();
      });

    await render(true);
    await act(async () => {
      navItem('account')?.click();
      await flush();
    });
    expect(panel('account')?.hidden).toBe(false);

    await render(false);
    await render(true);

    expect(panel('credentials')?.hidden).toBe(false);
    expect(panel('account')?.hidden).toBe(true);
  });

  it('renders nothing — and asks for no credentials — while closed', async () => {
    await act(async () => {
      root.render(createElement(AccountSettingsModal, { isOpen: false, onClose: () => {} }));
      await flush();
    });

    expect(document.body.querySelector('.account-settings-modal-card')).toBeNull();
    expect(connectApi.getCreatorAgentKey).not.toHaveBeenCalled();
    expect(connectApi.listOAuthGrants).not.toHaveBeenCalled();
  });
});
