// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthContext.js';
import i18n from './i18n/index.js';
import { NavHeader } from './NavHeader.js';

describe('NavHeader Up chevron', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ user: null }));
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      return new Response('{}', { status: 404 });
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders an Up control that navigates to the parent path', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onUp = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          AuthProvider,
          null,
          createElement(NavHeader, {
            activeBuildCount: 0,
            onNavigate: vi.fn(),
            onHome: vi.fn(),
            onStudio: vi.fn(),
            upTarget: { path: '/studio', ariaLabel: 'Back to Studio' },
            onUp,
          }),
        ),
      );
    });

    const up = container.querySelector<HTMLButtonElement>('button.nav-up');
    expect(up).not.toBeNull();
    expect(up?.getAttribute('aria-label')).toBe('Back to Studio');

    await act(async () => {
      up?.click();
    });
    expect(onUp).toHaveBeenCalledWith('/studio');

    await act(async () => {
      root.unmount();
    });
  });

  it('hides the Up control when there is no parent target', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          AuthProvider,
          null,
          createElement(NavHeader, {
            activeBuildCount: 0,
            onNavigate: vi.fn(),
            onHome: vi.fn(),
            onStudio: vi.fn(),
            upTarget: null,
          }),
        ),
      );
    });

    expect(container.querySelector('button.nav-up')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
