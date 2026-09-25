// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateAgentCallout } from './CreateAgentCallout.js';
import i18n from './i18n/index.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('CreateAgentCallout', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  it('renders agent callout and navigates to connect routes on click', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const onNavigate = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(CreateAgentCallout, { onNavigate }));
      await flushEffects();
    });

    const callout = container.querySelector('.create-agent-callout');
    expect(callout).not.toBeNull();

    const mainLink = callout?.querySelector('a.create-agent-callout-btn');
    expect(mainLink?.getAttribute('href')).toBe('/connect');

    await act(async () => {
      mainLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      await flushEffects();
    });
    expect(onNavigate).toHaveBeenCalledWith('/connect');

    await act(async () => root.unmount());
  });
});
