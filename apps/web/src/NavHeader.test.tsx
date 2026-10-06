// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthContext.js';
import i18n from './i18n/index.js';
import { NavHeader } from './NavHeader.js';

function navFns<T extends object>(extra: T = {} as T) {
  return {
    onCreate: vi.fn(),
    onHome: vi.fn(),
    onStudio: vi.fn(),
    onReview: vi.fn(),
    onPlay: vi.fn(),
    onParty: vi.fn(),
    onConnect: vi.fn(),
    ...extra,
  };
}

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
            ...navFns(),
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
            ...navFns(),
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
    const fns = navFns();
    await act(async () => {
      root.render(
        createElement(
          AuthProvider,
          null,
          createElement(NavHeader, {
            activeBuildCount: 2,
            ...fns,
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
    return { container, root, onConnect: fns.onConnect };
  }

  it('keeps Create Game, Studio and Review for admins, with no operator console link', async () => {
    const { container, root, onConnect } = await renderSignedIn(true);
    const labels = Array.from(container.querySelectorAll('.nav-link')).map((el) => el.textContent ?? '');

    expect(labels.some((text) => /Create Game/i.test(text))).toBe(true);
    expect(labels.some((text) => /Studio/i.test(text))).toBe(true);
    // Play lives only here — the flat nav hides below 1099px.
    expect(labels.some((text) => text.trim() === 'Play')).toBe(true);
    // The operator console moved out of the site; nothing here links to it.
    expect(labels.some((text) => /Operator/i.test(text))).toBe(false);
    expect(
      vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => String(input).endsWith('/api/admin/summary')),
    ).toHaveLength(0);
    expect(labels.some((text) => /^Review$|Review/.test(text))).toBe(true);
    expect(labels.some((text) => /Arcade/i.test(text))).toBe(false);
    expect(labels.some((text) => /Account settings/i.test(text))).toBe(false);
    // GitHub left the header; the footer carries the repo link instead.
    expect(container.querySelector('a.github')).toBeNull();
    expect(labels.some((text) => /GitHub/i.test(text))).toBe(false);
    // Sign out sits at the foot of the menu, not beside the avatar.
    expect(container.querySelector('.logout-btn')).toBeNull();
    expect(labels.some((text) => /Connect an agent/i.test(text))).toBe(true);
    expect(labels.some((text) => /Sign out/i.test(text))).toBe(true);
    expect(container.querySelector('.nav-link--sign-out')).not.toBeNull();
    const connect = Array.from(container.querySelectorAll('.nav-link')).find((el) =>
      /Connect an agent/i.test(el.textContent ?? ''),
    ) as HTMLButtonElement;
    expect(connect.tagName).toBe('BUTTON');
    await act(async () => connect.click());
    expect(onConnect).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('keeps the hamburger icon when open and highlights it instead of turning into an X', async () => {
    const { container, root } = await renderSignedIn();
    const hamburger = container.querySelector('.hamburger-btn') as HTMLButtonElement;

    expect(hamburger.getAttribute('aria-expanded')).toBe('true');
    expect(hamburger.getAttribute('aria-haspopup')).toBe('menu');
    expect(container.querySelector('.hamburger-container.is-open')).not.toBeNull();
    expect(container.querySelector('.dropdown-menu')).not.toBeNull();
    // Menu glyph = 66 rects; close/X is 35.
    expect(hamburger.querySelectorAll('svg rect').length).toBe(66);

    await act(async () => root.unmount());
  });

  it('closes the dropdown when tapping outside it', async () => {
    const { container, root } = await renderSignedIn();
    expect(container.querySelector('.dropdown-menu')).not.toBeNull();

    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('.dropdown-menu')).toBeNull();
    expect(container.querySelector('.hamburger-container.is-open')).toBeNull();

    await act(async () => root.unmount());
  });

  it('leaves the dropdown open when the tap lands inside it', async () => {
    const { container, root } = await renderSignedIn();
    const menu = container.querySelector('.dropdown-menu') as HTMLElement;

    await act(async () => {
      menu.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('.dropdown-menu')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('closes the dropdown on Escape', async () => {
    const { container, root } = await renderSignedIn();
    expect(container.querySelector('.dropdown-menu')).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('.dropdown-menu')).toBeNull();

    await act(async () => root.unmount());
  });

  it('calls onCreate when Create Game is clicked, and highlights it on /create', async () => {
    const onCreate = vi.fn();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
            isOnCreate: true,
            ...navFns({ onCreate }),
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

    const createGame = Array.from(container.querySelectorAll<HTMLButtonElement>('.dropdown-menu .nav-link')).find(
      (btn) => /Create Game/i.test(btn.textContent ?? ''),
    );
    expect(createGame).toBeDefined();
    expect(createGame?.className).toContain('is-active');
    await act(async () => {
      createGame?.click();
      await Promise.resolve();
    });

    expect(onCreate).toHaveBeenCalled();
    expect(container.querySelector('.dropdown-menu')).toBeNull();

    await act(async () => root.unmount());
  });

  it('offers Play, Create, Studio and Party as plain links in the always-visible header nav', async () => {
    const onCreate = vi.fn();
    const onPlay = vi.fn();
    const onStudio = vi.fn();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
            isOnCreate: true,
            isOnStudio: false,
            ...navFns({ onCreate, onStudio, onPlay }),
            upTarget: null,
          }),
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const links = Array.from(container.querySelectorAll<HTMLButtonElement>('.header-nav .header-nav-link'));
    const labels = links.map((btn) => btn.textContent?.trim());
    expect(labels).toEqual(['Play', 'Create', 'Studio', 'Party']);

    // Plain text links, not the dropdown's boxed rows.
    const findByLabel = (label: string) => links.find((btn) => btn.textContent?.trim() === label);
    expect(findByLabel('Create')?.className).toContain('is-active');
    expect(findByLabel('Studio')?.className).not.toContain('is-active');

    await act(async () => {
      findByLabel('Play')?.click();
    });
    expect(onPlay).toHaveBeenCalled();

    await act(async () => {
      findByLabel('Studio')?.click();
    });
    expect(onStudio).toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('also reaches Play from the dropdown, where the flat nav is hidden', async () => {
    const onPlay = vi.fn();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: null }));
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      return new Response('{}', { status: 404 });
    });

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
            ...navFns({ onPlay }),
            upTarget: null,
          }),
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.hamburger-btn')?.click();
    });

    const dropdownLinks = Array.from(container.querySelectorAll<HTMLButtonElement>('.dropdown-menu .nav-link'));
    const playItem = dropdownLinks.find((btn) => btn.textContent?.trim() === 'Play');
    expect(playItem).toBeDefined();

    await act(async () => {
      playItem?.click();
    });
    expect(onPlay).toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('hides Operator and Review from non-operators', async () => {
    const { container, root } = await renderSignedIn(false);
    const labels = Array.from(container.querySelectorAll('.nav-link')).map((el) => el.textContent ?? '');
    expect(labels.some((text) => /Operator/i.test(text))).toBe(false);
    expect(labels.some((text) => /\bReview\b/.test(text))).toBe(false);
    await act(async () => root.unmount());
  });

  it('offers Review to a reviewer who is not an operator', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            user: { uid: 'g:reviewer', tier: 'free', name: 'Reviewer', reviewer: true },
          }),
        );
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      return new Response('{}', { status: 404 });
    });

    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onReview = vi.fn();
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
            ...navFns({ onReview }),
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

    const labels = Array.from(container.querySelectorAll('.nav-link')).map((el) => el.textContent ?? '');
    expect(labels.some((text) => /Operator/i.test(text))).toBe(false);
    const review = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link')).find((btn) =>
      /\bReview\b/.test(btn.textContent ?? ''),
    );
    expect(review).toBeDefined();
    await act(async () => {
      review?.click();
      await Promise.resolve();
    });
    expect(onReview).toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('badges Review with remaining games when a sweep is active', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            user: { uid: 'g:reviewer', tier: 'free', name: 'Reviewer', reviewer: true },
          }),
        );
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      if (url.endsWith('/api/review/status')) {
        return new Response(
          JSON.stringify({
            remaining: 5,
            sweep: { id: 'swp-1', status: 'active', total: 5, released: 5 },
          }),
        );
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
            ...navFns(),
            upTarget: null,
          }),
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const hamburger = container.querySelector('.hamburger-btn') as HTMLButtonElement;
    await act(async () => {
      hamburger.click();
      await Promise.resolve();
    });

    const review = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link')).find((btn) =>
      (btn.textContent ?? '').includes('Review'),
    );
    expect(review).toBeDefined();
    expect(review!.querySelector('.specs-count-badge')?.textContent).toBe('5');
    expect(review!.querySelector('.specs-count-badge')?.getAttribute('aria-label')).toBe('5 games to review');

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
            ...navFns(),
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

  it('never probes an operator endpoint from the chrome for non-operators', async () => {
    const { root } = await renderSignedIn(false);
    const summaryCalls = () =>
      vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => String(input).endsWith('/api/admin/summary')).length;

    expect(summaryCalls()).toBe(0);
    await act(async () => root.unmount());
  });
});

describe('NavHeader Studio live count', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('badges the flat Studio link, the hamburger, and the dropdown row alike', async () => {
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
            ...navFns({ onStudio }),
            upTarget: null,
          }),
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('.studio-chip')).toBeNull();

    const flatStudioLink = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.header-nav .header-nav-link'),
    ).find((el) => el.textContent?.includes('Studio'));
    expect(flatStudioLink).toBeDefined();
    expect(flatStudioLink?.querySelector('.specs-count-badge')?.textContent).toBe('9');

    await act(async () => flatStudioLink?.click());
    expect(onStudio).toHaveBeenCalledOnce();

    // The hamburger carries the same count once the flat nav hides.
    const hamburger = container.querySelector<HTMLButtonElement>('.hamburger-btn');
    expect(hamburger?.querySelector('.hamburger-live-badge')?.textContent).toBe('9');
    await act(async () => hamburger?.click());
    const dropdownStudioLink = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.dropdown-menu .nav-link'),
    ).find((el) => /Studio/i.test(el.textContent ?? ''));
    expect(dropdownStudioLink?.querySelector('.specs-count-badge')?.textContent).toBe('9');

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
            ...navFns(),
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
            ...navFns(),
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

  it('renders EN and PL with the active language pressed', async () => {
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
            ...navFns(),
            upTarget: null,
          }),
        ),
      );
      await Promise.resolve();
    });

    const switcher = container.querySelector('.language-switcher');
    // Header + (closed) menu: only the header instance is mounted while the menu is closed.
    expect(switcher).not.toBeNull();
    const buttons = [...(switcher?.querySelectorAll('button') ?? [])];
    expect(buttons.map((b) => b.textContent)).toEqual(['EN', 'PL']);
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      buttons[1]?.click();
      // The click's own i18n.changeLanguage(lang) is fire-and-forget (its result isn't
      // reachable from a DOM click), and now genuinely async — it fetches pl.json on
      // demand rather than switching between two already-bundled locales. Awaiting the
      // same call here (a safe no-op once the click's own call has already loaded it)
      // is what actually waits for that fetch instead of one microtask tick.
      await i18n.changeLanguage('pl');
    });
    expect(i18n.language).toMatch(/^pl/);
    const after = [...(container.querySelectorAll('.language-switcher button') ?? [])];
    expect(after[0]?.getAttribute('aria-pressed')).toBe('false');
    expect(after[1]?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => root.unmount());
  });
});
