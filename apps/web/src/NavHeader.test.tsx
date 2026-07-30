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
            onAdmin: vi.fn(),
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
            onAdmin: vi.fn(),
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

// The console has been reachable only by typing its URL, which is why the one operator
// surface with something to do on it was also the one nothing linked to.
describe('NavHeader operator link', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    // The badge polls; the tests that care about that advance the clock themselves.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function renderWith(summary: { status: number; body: unknown }, admin = true) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        // The session says whether this account is an operator; the nav never asks an
        // operator endpoint to find out.
        return new Response(
          JSON.stringify({ user: { uid: 'g:boss', tier: 'free', ...(admin ? { admin: true } : {}) } }),
        );
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      if (url.endsWith('/api/admin/summary')) {
        return new Response(JSON.stringify(summary.body), { status: summary.status });
      }
      return new Response('{}', { status: 404 });
    });

    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onAdmin = vi.fn();
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
            onAdmin,
            upTarget: null,
          }),
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // The menu holds the link; open it the way a reader would.
    const hamburger = container.querySelector('.hamburger-btn') as HTMLButtonElement;
    await act(async () => {
      hamburger.click();
      await Promise.resolve();
    });
    return { container, root, onAdmin };
  }

  it('offers the console, with what is waiting, to an operator', async () => {
    const { container, root, onAdmin } = await renderWith({
      status: 200,
      body: {
        alerts: [
          {
            id: 'op-1-review_ready',
            kind: 'review_ready',
            issueNumber: 1,
            title: 'X',
            ownerUid: 'g:1',
            since: '2026-07-30T11:00:00Z',
          },
        ],
        queue: { active: 1, stalled: 0, byState: {} },
        limits: { paused: false, globalDailySubmissionCap: 50, todaySubmissions: 0 },
      },
    });

    const link = Array.from(container.querySelectorAll('.nav-link')).find((element) =>
      element.textContent?.includes('Operator'),
    ) as HTMLButtonElement;
    expect(link).toBeTruthy();
    expect(link.querySelector('.specs-count-badge')?.textContent).toBe('1');

    await act(async () => link.click());
    expect(onAdmin).toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('never asks an operator endpoint on behalf of someone who is not one', async () => {
    // The 404 probe this replaced put an error in every non-operator's console on every
    // page load — which is most people, on most page loads, and is what failed the
    // deploy gate. A non-operator now makes no operator request at all.
    const { root } = await renderWith({ status: 404, body: { error: 'not found' } }, false);
    const summaryCalls = () =>
      vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => String(input).endsWith('/api/admin/summary')).length;

    expect(summaryCalls()).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000);
      await Promise.resolve();
    });

    expect(summaryCalls()).toBe(0);

    await act(async () => root.unmount());
  });

  it('shows nobody else that there is a console at all', async () => {
    // A session with no `admin` flag is the API's answer for a signed-in non-admin, and
    // the nav treats it as the whole answer: no link, no badge, nothing to notice.
    const { container, root } = await renderWith({ status: 404, body: { error: 'not found' } }, false);

    const link = Array.from(container.querySelectorAll('.nav-link')).find((element) =>
      element.textContent?.includes('Operator'),
    );
    expect(link).toBeUndefined();

    await act(async () => root.unmount());
  });
});
