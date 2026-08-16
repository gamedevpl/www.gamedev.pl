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

vi.mock('./connectApi.js', () => connectApi);

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
