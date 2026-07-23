// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthContext';
import { ClosedBetaSplash } from './ClosedBetaSplash';
import i18n from './i18n';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ClosedBetaSplash', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    delete (globalThis as { google?: unknown }).google;
  });

  it('renders the loading skeleton when loading=true', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({}), { status: 401 });
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: true }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(ClosedBetaSplash, { loading: true })));
      await flushEffects();
    });

    // Should show spinner, not the sign-in button
    expect(container.querySelector('.beta-splash__spinner')).not.toBeNull();
    expect(container.querySelector('.google-sign-in-container')).toBeNull();
    expect(container.querySelector('#btn-join-waitlist')).toBeNull();

    await act(async () => root.unmount());
  });

  it('signed-out visitor sees the Google sign-in button', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({}), { status: 401 });
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: true }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(ClosedBetaSplash)));
      await flushEffects();
    });

    expect(container.querySelector('.google-sign-in-container')).not.toBeNull();
    expect(container.querySelector('#btn-join-waitlist')).toBeNull();

    await act(async () => root.unmount());
  });

  it('a rejected sign-in shows the waitlist CTA, and joining shows confirmation', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let capturedCallback: ((res: { credential: string }) => void) | null = null;

    (globalThis as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (config: { callback: (res: { credential: string }) => void }) => {
            capturedCallback = config.callback;
          },
          renderButton: () => {},
          prompt: () => {},
        },
      },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({}), { status: 401 });
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: true }));
      }
      if (url.endsWith('/api/auth/google')) {
        // 403 with no waitlistStatus — user is not yet on the waitlist
        return new Response(JSON.stringify({ error: 'private beta — sign-ups are closed', waitlistStatus: null }), {
          status: 403,
        });
      }
      if (url.endsWith('/api/waitlist')) {
        const body = JSON.parse(String(init?.body)) as { idToken: string };
        expect(body.idToken).toBe('test-credential');
        return new Response(JSON.stringify({ status: 'ok', waitlistStatus: 'pending' }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(ClosedBetaSplash)));
      await flushEffects();
    });

    expect(capturedCallback).not.toBeNull();

    await act(async () => {
      capturedCallback!({ credential: 'test-credential' });
      await flushEffects();
      await flushEffects();
    });

    const joinButton = container.querySelector<HTMLButtonElement>('#btn-join-waitlist');
    expect(joinButton).not.toBeNull();
    expect(container.querySelector('.beta-splash__blocked-msg')?.textContent).toContain('closed');

    await act(async () => {
      joinButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('#btn-join-waitlist')).toBeNull();
    expect(container.querySelector('.beta-splash__waitlist-confirm')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('shows existing waitlist status from the 403 response', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let capturedCallback: ((res: { credential: string }) => void) | null = null;

    (globalThis as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (config: { callback: (res: { credential: string }) => void }) => {
            capturedCallback = config.callback;
          },
          renderButton: () => {},
          prompt: () => {},
        },
      },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({}), { status: 401 });
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: true }));
      }
      if (url.endsWith('/api/auth/google')) {
        // 403 with pending status — user is already on the waitlist
        return new Response(
          JSON.stringify({ error: 'private beta — sign-ups are closed', waitlistStatus: 'pending' }),
          { status: 403 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await i18n.changeLanguage('en');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(ClosedBetaSplash)));
      await flushEffects();
    });

    expect(capturedCallback).not.toBeNull();

    await act(async () => {
      capturedCallback!({ credential: 'test-credential' });
      await flushEffects();
      await flushEffects();
    });

    // Should show the pending status directly, NOT the join button
    expect(container.querySelector('#btn-join-waitlist')).toBeNull();
    expect(container.querySelector('.beta-splash__waitlist-confirm')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
