// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioPatPanel } from './StudioPatPanel.js';

describe('StudioPatPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return {
            ok: true,
            json: async () => ({
              token: 'gdpl_pat_deadbeefdeadbeef_secret',
              tokenId: 'deadbeefdeadbeef',
              name: 'ci',
              expiresAt: '2026-09-27T00:00:00.000Z',
            }),
          };
        }
        if (String(url).includes('/api/me/access-tokens')) {
          return { ok: true, json: async () => ({ tokens: [] }) };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('mints a token from a session and shows it once', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(StudioPatPanel));
    });
    const button = host.querySelector('button');
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelector('[data-testid="pat-secret"]')?.textContent).toContain('gdpl_pat_');
    await act(async () => root.unmount());
  });
});
