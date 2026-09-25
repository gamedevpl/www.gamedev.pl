// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateBuilderLanes } from './CreateBuilderLanes.js';
import i18n from './i18n/index.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('CreateBuilderLanes', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  it('renders builder lanes with connection links and navigates on click', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const onNavigate = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(CreateBuilderLanes, { onNavigate }));
      await flushEffects();
    });

    const cta = container.querySelector('.create-builder-lane-cta');
    expect(cta).not.toBeNull();

    const mainBtn = cta?.querySelector('a.create-builder-cta-btn');
    expect(mainBtn?.getAttribute('href')).toBe('/connect');

    const mcpLink = cta?.querySelector('a[href="/connect#mcp"]');
    expect(mcpLink).not.toBeNull();

    const cliLink = cta?.querySelector('a[href="/connect#cli"]');
    expect(cliLink).not.toBeNull();

    const chipLinks = container.querySelectorAll('.create-agent-chips a[href="/connect#mcp"]');
    expect(chipLinks.length).toBe(4);

    await act(async () => {
      mainBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      await flushEffects();
    });
    expect(onNavigate).toHaveBeenCalledWith('/connect');

    await act(async () => {
      mcpLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      await flushEffects();
    });
    expect(onNavigate).toHaveBeenCalledWith('/connect#mcp');

    await act(async () => {
      cliLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      await flushEffects();
    });
    expect(onNavigate).toHaveBeenCalledWith('/connect#cli');

    await act(async () => root.unmount());
  });
});
