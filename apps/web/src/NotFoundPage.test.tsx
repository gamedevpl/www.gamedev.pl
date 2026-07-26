// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n';
import { NotFoundPage } from './NotFoundPage';

describe('NotFoundPage', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders the 404 copy and calls onHome from the CTA', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const onHome = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(NotFoundPage, { onHome }));
    });

    expect(container.querySelector('#not-found-title')?.textContent).toBe('Page not found');
    expect(container.textContent).toContain("That link doesn't go anywhere on gamedev.pl");

    const button = container.querySelector('button.not-found__home');
    expect(button).not.toBeNull();
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onHome).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });
});
