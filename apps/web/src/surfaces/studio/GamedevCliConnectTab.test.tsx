// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { GamedevCliConnectTab } from './GamedevCliConnectTab.js';

describe('GamedevCliConnectTab', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('renders install + connect when the surface is enabled', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) })),
    );
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(GamedevCliConnectTab, { slug: 'ghost-roads' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.textContent).toContain('gamedev connect ghost-roads');
    expect(host.textContent).toContain(`${window.location.origin}/install.sh`);
    await act(async () => root.unmount());
  });

  it('renders nothing when the surface is off', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(GamedevCliConnectTab, { slug: 'ghost-roads' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.querySelector('[data-testid="gamedev-cli-connect"]')).toBeNull();
    await act(async () => root.unmount());
  });
});
