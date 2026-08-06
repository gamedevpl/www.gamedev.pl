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

describe('NavHeader menu', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  async function renderSignedIn(admin = false) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            user: { uid: 'g:boss', tier: 'free', name: 'Boss', ...(admin ? { admin: true } : {}) },
          }),
        );
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      return new Response('{}', { status: 404 });
    });

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
            activeBuildCount: 2,
            onNavigate: vi.fn(),
            onHome: vi.fn(),
            onStudio: vi.fn(),
            upTarget: null,
          }),
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const hamburger = container.querySelector('.hamburger-btn') as HTMLButtonElement;
    await act(async () => {
      hamburger.click();
      await Promise.resolve();
    });
    return { container, root };
  }

  it('keeps Create Game and Studio, and drops Arcade / Operator / Account settings', async () => {
    const { container, root } = await renderSignedIn(true);
    const labels = Array.from(container.querySelectorAll('.nav-link')).map((el) => el.textContent ?? '');

    expect(labels.some((text) => /Create Game/i.test(text))).toBe(true);
    expect(labels.some((text) => /Studio/i.test(text))).toBe(true);
    expect(labels.some((text) => /Arcade/i.test(text))).toBe(false);
    expect(labels.some((text) => /Operator/i.test(text))).toBe(false);
    expect(labels.some((text) => /Account settings/i.test(text))).toBe(false);
    // GitHub left the header; the footer carries the repo link instead.
    expect(container.querySelector('a.github')).toBeNull();
    expect(labels.some((text) => /GitHub/i.test(text))).toBe(false);
    // Sign out sits at the foot of the menu, not beside the avatar.
    expect(container.querySelector('.logout-btn')).toBeNull();
    expect(labels.some((text) => /Sign out/i.test(text))).toBe(true);
    expect(container.querySelector('.nav-link--sign-out')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('signs out from the menu foot and closes the menu', async () => {
    const logoutSpy = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ user: { uid: 'g:boss', tier: 'free', name: 'Boss' } }));
      }
      if (url.endsWith('/api/auth/logout') && init && typeof init === 'object' && init.method === 'POST') {
        logoutSpy();
        return new Response(JSON.stringify({ ok: true }));
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      return new Response('{}', { status: 404 });
    });

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
      await Promise.resolve();
      await Promise.resolve();
    });

    const hamburger = container.querySelector('.hamburger-btn') as HTMLButtonElement;
    await act(async () => {
      hamburger.click();
      await Promise.resolve();
    });

    const signOut = container.querySelector<HTMLButtonElement>('.nav-link--sign-out');
    expect(signOut).not.toBeNull();
    await act(async () => {
      signOut?.click();
      await Promise.resolve();
    });

    expect(logoutSpy).toHaveBeenCalledOnce();
    expect(container.querySelector('.dropdown-menu')).toBeNull();

    await act(async () => root.unmount());
  });

  it('never probes an operator endpoint from the chrome', async () => {
    const { root } = await renderSignedIn(true);
    const summaryCalls = () =>
      vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => String(input).endsWith('/api/admin/summary')).length;

    expect(summaryCalls()).toBe(0);
    await act(async () => root.unmount());
  });
});

describe('NavHeader Studio chip', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('shows the rich live chip in the header and opens Studio', async () => {
    await i18n.changeLanguage('en');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ user: { uid: 'g:ada', tier: 'standard', name: 'Ada' } }));
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      return new Response('{}', { status: 404 });
    });

    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onStudio = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          AuthProvider,
          null,
          createElement(NavHeader, {
            activeBuildCount: 9,
            onNavigate: vi.fn(),
            onHome: vi.fn(),
            onStudio,
            upTarget: null,
          }),
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const chip = container.querySelector<HTMLButtonElement>('button.studio-chip');
    expect(chip).not.toBeNull();
    expect(chip?.classList.contains('is-live')).toBe(true);
    expect(chip?.textContent).toMatch(/9 in progress/i);
    expect(chip?.textContent).toMatch(/Studio/i);

    await act(async () => chip?.click());
    expect(onStudio).toHaveBeenCalledOnce();

    // Menu carries the same count for phones (where the chip is CSS-hidden).
    const hamburger = container.querySelector<HTMLButtonElement>('.hamburger-btn');
    expect(hamburger?.querySelector('.hamburger-live-badge')?.textContent).toBe('9');
    await act(async () => hamburger?.click());
    const studioLink = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link')).find((el) =>
      /Studio/i.test(el.textContent ?? ''),
    );
    expect(studioLink?.querySelector('.specs-count-badge')?.textContent).toBe('9');

    await act(async () => root.unmount());
  });
});

describe('NavHeader profile link', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('links the signed-in name to /:handle when a handle is claimed', async () => {
    await i18n.changeLanguage('en');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            user: {
              uid: 'g:ada',
              tier: 'standard',
              name: 'Ada Lovelace',
              handle: 'ada',
              profileName: 'Ada',
            },
          }),
        );
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      return new Response('{}', { status: 404 });
    });

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
      await Promise.resolve();
      await Promise.resolve();
    });

    const profile = container.querySelector<HTMLAnchorElement>('a.user-name--profile');
    expect(profile).not.toBeNull();
    expect(profile?.getAttribute('href')).toBe('/ada');
    expect(profile?.textContent).toBe('Ada');

    await act(async () => root.unmount());
  });

  it('opens account settings from the avatar when no handle is claimed', async () => {
    await i18n.changeLanguage('en');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ user: { uid: 'g:ada', tier: 'standard', name: 'Ada Lovelace' } }));
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      return new Response('{}', { status: 404 });
    });

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
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('a.user-name--profile')).toBeNull();
    expect(container.querySelector('.user-name')?.textContent).toBe('Ada Lovelace');

    const avatar = container.querySelector<HTMLButtonElement>('button.user-avatar-btn');
    expect(avatar).not.toBeNull();
    await act(async () => avatar?.click());
    expect(document.body.querySelector('.account-settings-modal-card')).not.toBeNull();

    await act(async () => root.unmount());
  });
});

describe('LanguageSwitcher in header', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders one button that toggles to the other language', async () => {
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
      await Promise.resolve();
    });

    const switcher = container.querySelector<HTMLButtonElement>('button.language-switcher');
    // Header + (closed) menu: only the header instance is mounted while the menu is closed.
    expect(switcher).not.toBeNull();
    expect(switcher?.textContent).toBe('PL');

    await act(async () => {
      switcher?.click();
      await Promise.resolve();
    });
    expect(i18n.language).toMatch(/^pl/);
    expect(container.querySelector('button.language-switcher')?.textContent).toBe('EN');

    await act(async () => root.unmount());
  });
});
