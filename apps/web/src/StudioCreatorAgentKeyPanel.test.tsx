// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { StudioCreatorAgentKeyPanel } from './StudioCreatorAgentKeyPanel.js';

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('StudioCreatorAgentKeyPanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('/api/me/creator-agent-key/rotate') && method === 'POST') {
          return {
            ok: true,
            json: async () => ({
              key: 'rotated-creator-key',
              keyGeneration: 2,
              expiresAt: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
              revoked: false,
            }),
          };
        }
        if (url.endsWith('/api/me/creator-agent-key') && method === 'POST') {
          return {
            ok: true,
            json: async () => ({
              key: 'fresh-creator-key',
              keyGeneration: 1,
              expiresAt: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
              revoked: false,
            }),
          };
        }
        if (url.endsWith('/api/me/creator-agent-key') && method === 'DELETE') {
          return { ok: true, status: 204, json: async () => null };
        }
        return {
          ok: true,
          json: async () => ({ keyGeneration: 0, revoked: false }),
        };
      }),
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mints a key and warns that rotate stops agents holding the old key', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioCreatorAgentKeyPanel));
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(container.textContent).toMatch(/Create key/i);
    expect(container.textContent?.toLowerCase()).not.toContain('token');

    await act(async () => {
      container.querySelectorAll('button').forEach((button) => {
        if (button.textContent?.includes('Create key')) button.click();
      });
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(container.textContent).toContain('fresh-creator-key');

    await act(async () => {
      container.querySelectorAll('button').forEach((button) => {
        if (button.textContent?.includes('Rotate key')) button.click();
      });
      await flush();
    });

    expect(container.textContent).toMatch(/stops any agent still holding the old key/i);
  });
});
