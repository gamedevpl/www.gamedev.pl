// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./AppLoadingScreen.js', () => ({ AppLoadingScreen: () => createElement('div', null, 'loading') }));
vi.mock('./ClosedBetaSplash.js', () => ({
  ClosedBetaSplash: ({ inviteCode }: { inviteCode?: string }) =>
    createElement('div', null, `splash:${inviteCode ?? ''}`),
}));

vi.mock('./App.js', () => ({ App: () => createElement('div', null, 'app') }));

const session = { user: null as unknown, loading: false, privateBeta: true };
vi.mock('./AuthContext.js', () => ({ useAuth: () => session }));

const { BootGate } = await import('./BootGate.js');

const INVITE_CODE = 'A'.repeat(32);

async function renderAt(path: string, hash = '') {
  window.history.replaceState({}, '', path + hash);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(BootGate)));
  await act(async () => {});
  return { text: container.textContent ?? '', root };
}

beforeEach(() => {
  Object.assign(session, { user: null, loading: false, privateBeta: true });
});

describe('BootGate', () => {
  it('answers a walled visitor on the home page without loading the app', async () => {
    const { text, root } = await renderAt('/');
    expect(text).toBe('splash:');
    root.unmount();
  });

  it('carries the code through on an invite link', async () => {
    const { text, root } = await renderAt(`/invite/${INVITE_CODE}`);
    expect(text).toBe(`splash:${INVITE_CODE}`);
    root.unmount();
  });

  it('waits rather than guessing while the session is still loading', async () => {
    Object.assign(session, { loading: true });
    const { text, root } = await renderAt('/');
    expect(text).toBe('loading');
    root.unmount();
  });
});

// Paths verified against parsePathRoute, not assumed.
describe.each([
  ['/terms', '', 'legal'],
  ['/contact', '', 'contact'],
  ['/connect', '', 'connect'],
  ['/creators/ada', '', 'creator'],
  ['/ada', '', 'creator'],
  ['/proposals', '', 'proposals'],
  ['/join/ABC123', '#tok3n', 'join'],
  ['/nothing-here', '', 'notFound'],
])('a signed-out visitor at %s', (path, hash, view) => {
  it(`still gets the app, because ${view} renders without a session`, async () => {
    const { text, root } = await renderAt(path, hash);
    expect(text).toBe('app');
    root.unmount();
  });
});

// canonicalPath rewrites these to '/', so App would have shown the splash too.
describe.each(['/gamedevpl', '/creators/gamedevpl'])('the home alias %s', (path) => {
  it('gets the splash, and the address bar gets the canonical path', async () => {
    const { text, root } = await renderAt(path);
    expect(text).toBe('splash:');
    expect(window.location.pathname).toBe('/');
    root.unmount();
  });
});

describe('BootGate, once the wall does not apply', () => {
  it('loads the app for a signed-in visitor', async () => {
    Object.assign(session, { user: { uid: 'g:someone' } });
    const { text, root } = await renderAt('/');
    expect(text).toBe('app');
    root.unmount();
  });

  it('loads the app when the site is open', async () => {
    Object.assign(session, { privateBeta: false });
    const { text, root } = await renderAt('/');
    expect(text).toBe('app');
    root.unmount();
  });
});

