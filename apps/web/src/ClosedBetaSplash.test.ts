// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthContext.js';
import { ClosedBetaSplash } from './ClosedBetaSplash.js';
import i18n from './i18n/index.js';
import { setVisitSessionForTesting, VisitSession } from './visitTelemetry.js';

import { AppLoadingScreen } from './AppLoadingScreen.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ClosedBetaSplash', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (globalThis as { google?: unknown }).google;
    setVisitSessionForTesting(null);
  });

  it('renders the full screen AppLoadingScreen component', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(AppLoadingScreen));
      await flushEffects();
    });

    expect(container.querySelector('.app-loading-screen__mascot')).not.toBeNull();
    expect(container.querySelector('.app-loading-screen__logo')).not.toBeNull();
    expect(container.querySelector('.app-loading-screen__exit')).toBeNull();

    await act(async () => root.unmount());
  });

  it('signed-out visitor sees Join waitlist before sign-in', async () => {
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

    const joinButton = container.querySelector<HTMLButtonElement>('#btn-join-waitlist');
    expect(joinButton).not.toBeNull();
    expect(joinButton?.textContent).toMatch(/waitlist/i);
    expect(container.querySelector('.google-sign-in')).not.toBeNull();
    // Join sits above the sign-in buttons in the DOM.
    const waitlist = container.querySelector('.beta-splash__waitlist');
    const signin = container.querySelector('.beta-splash__signin');
    expect(waitlist).not.toBeNull();
    expect(signin).not.toBeNull();
    expect(waitlist!.compareDocumentPosition(signin!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const mascot = container.querySelector<HTMLButtonElement>('button.mascot-interactive.beta-splash__mascot');
    expect(mascot).not.toBeNull();
    expect(mascot?.getAttribute('aria-label')).toMatch(/poke|szturchnij/i);

    await act(async () => root.unmount());
  });

  it('keeps Join waitlist on screen after the secret game starts', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
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

    const mascot = container.querySelector<HTMLButtonElement>('button.mascot-interactive.beta-splash__mascot');
    expect(mascot).not.toBeNull();
    await act(async () => {
      for (let i = 0; i < 5; i += 1) mascot!.click();
      await flushEffects();
    });

    expect(container.querySelector('.splash-game__stage')).not.toBeNull();
    expect(container.querySelector('#btn-join-waitlist')).not.toBeNull();
    expect(container.querySelector('.beta-splash__signin')).not.toBeNull();
    expect(container.querySelector('.beta-splash__legal')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('sends the invite code through sign-in and records acceptance', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let capturedCallback: ((res: { credential: string }) => void) | null = null;
    const sent: unknown[] = [];
    const session = new VisitSession('33333333-3333-4333-8333-333333333333', 0, (body) => sent.push(body));
    setVisitSessionForTesting(session);

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
        return new Response(JSON.stringify({ status: 'ok', privateBeta: true }));
      }
      if (url.endsWith('/api/auth/google')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          idToken: 'invite-credential',
          inviteCode: 'Abc123_-'.repeat(4),
        });
        return new Response(JSON.stringify({ user: { uid: 'g:invitee', tier: 'standard' } }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(AuthProvider, null, createElement(ClosedBetaSplash, { inviteCode: 'Abc123_-'.repeat(4) })),
      );
      await flushEffects();
    });

    expect(container.querySelector('#btn-accept-beta-invite')).not.toBeNull();
    await act(async () => {
      capturedCallback!({ credential: 'invite-credential' });
      await flushEffects();
      await flushEffects();
    });

    session.flush();
    const steps = sent.flatMap((body) => (body as { events: Array<{ type: string; step?: string }> }).events);
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'invite_step', step: 'opened' }),
        expect.objectContaining({ type: 'invite_step', step: 'accepted' }),
      ]),
    );

    await act(async () => root.unmount());
  });

  it('Join without a token asks for sign-in and does not POST yet', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const sent: unknown[] = [];
    const session = new VisitSession('11111111-1111-4111-8111-111111111111', 0, (body) => sent.push(body));
    setVisitSessionForTesting(session);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({}), { status: 401 });
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: true }));
      }
      if (url.endsWith('/api/waitlist')) {
        throw new Error('waitlist must not be called before sign-in');
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

    const joinButton = container.querySelector<HTMLButtonElement>('#btn-join-waitlist');
    await act(async () => {
      joinButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(container.querySelector('.beta-splash__signin-hint')?.textContent).toMatch(/Sign in/i);
    session.flush();
    const flush = sent[0] as { events: Array<{ type: string; step?: string }> };
    expect(flush.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'waitlist_step', step: 'cta_clicked' })]),
    );

    await act(async () => root.unmount());
  });

  it('Join then rejected sign-in auto-joins and records both funnel steps', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let capturedCallback: ((res: { credential: string }) => void) | null = null;
    const sent: unknown[] = [];
    const session = new VisitSession('22222222-2222-4222-8222-222222222222', 0, (body) => sent.push(body));
    setVisitSessionForTesting(session);

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

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('#btn-join-waitlist')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(capturedCallback).not.toBeNull();

    await act(async () => {
      capturedCallback!({ credential: 'test-credential' });
      await flushEffects();
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('#btn-join-waitlist')).toBeNull();
    expect(container.querySelector('.beta-splash__waitlist-confirm')).not.toBeNull();

    session.flush();
    const steps = sent.flatMap((body) => (body as { events: Array<{ type: string; step?: string }> }).events);
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'waitlist_step', step: 'cta_clicked' }),
        expect.objectContaining({ type: 'waitlist_step', step: 'joined' }),
      ]),
    );

    await act(async () => root.unmount());
  });

  it('a rejected sign-in without prior Join still shows the waitlist CTA with a token', async () => {
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

    expect(container.querySelector('#btn-join-waitlist')).toBeNull();
    expect(container.querySelector('.beta-splash__waitlist-confirm')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
