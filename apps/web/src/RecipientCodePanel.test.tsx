// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { RecipientCodePanel } from './RecipientCodePanel.js';

async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(RecipientCodePanel));
  });
  return { host, root };
}

function click(host: HTMLElement, testid: string) {
  return act(async () => {
    host.querySelector(`[data-testid="${testid}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('RecipientCodePanel', () => {
  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('keeps the code hidden until asked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ code: 'MY-CODE' }) })),
    );
    const { host, root } = await mount();

    expect(host.querySelector('[data-testid="studio-recipient-code"]')?.textContent).not.toContain('MY-CODE');
    await click(host, 'studio-recipient-code-reveal');
    expect(host.querySelector('[data-testid="studio-recipient-code"]')?.textContent).toBe('MY-CODE');

    expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true);
    await act(async () => root.unmount());
  });

  it('rotating replaces the code and shows the new one', async () => {
    let rotated = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/rotate')) rotated = true;
        return { ok: true, json: async () => ({ code: rotated ? 'NEW-CODE' : 'OLD-CODE' }) };
      }),
    );
    const { host, root } = await mount();

    await click(host, 'studio-recipient-code-rotate');

    // Revealed on rotation: an unread code cannot be passed on.
    expect(host.querySelector('[data-testid="studio-recipient-code"]')?.textContent).toBe('NEW-CODE');
    await act(async () => root.unmount());
  });

  it('says so when the code cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );
    const { host, root } = await mount();

    expect(host.querySelector('[data-testid="recipient-code-error"]')).not.toBeNull();
    await act(async () => root.unmount());
  });
});
