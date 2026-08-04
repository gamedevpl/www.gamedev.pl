// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { StudioOAuthClientsPanel } from './StudioOAuthClientsPanel.js';

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('StudioOAuthClientsPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('separates duplicate client names and confirms before disconnecting', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return { ok: true, status: 204 };
      }
      return {
        ok: true,
        json: async () => [
          {
            grantId: 'grant-111111',
            clientId: 'chatgpt',
            clientLabel: 'chatgpt.com',
            createdAt: '2026-08-03T15:40:00.000Z',
            lastUsedAt: '2026-08-04T10:20:00.000Z',
          },
          {
            grantId: 'grant-222222',
            clientId: 'chatgpt',
            clientLabel: 'chatgpt.com',
            createdAt: '2026-08-03T13:24:00.000Z',
            lastUsedAt: null,
          },
        ],
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(createElement(StudioOAuthClientsPanel));
      await flush();
    });

    expect(container.querySelectorAll('.studio-oauth-client-row')).toHaveLength(2);
    expect(container.textContent).toContain('Connection 111111');
    expect(container.textContent).toContain('Connection 222222');
    expect(container.textContent).not.toContain('chatgpt.comConnected');

    const firstDisconnect = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Disconnect',
    );
    expect(firstDisconnect).toBeDefined();

    await act(async () => {
      firstDisconnect?.click();
      await flush();
    });

    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'DELETE' }));
    expect(container.textContent).toContain('lose access immediately');

    const confirm = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Yes, disconnect',
    );
    await act(async () => {
      confirm?.click();
      await flush();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/me/oauth-grants/grant-111111'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(container.querySelectorAll('.studio-oauth-client-row')).toHaveLength(1);
  });
});
