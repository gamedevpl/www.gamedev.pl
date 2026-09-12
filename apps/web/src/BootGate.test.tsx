// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./AppLoadingScreen.js', () => ({ AppLoadingScreen: () => createElement('div', null, 'loading') }));
vi.mock('./ClosedBetaSplash.js', () => ({
  ClosedBetaSplash: ({ inviteCode }: { inviteCode?: string }) =>
    createElement('div', null, `splash:${inviteCode ?? ''}`),
}));
vi.mock('./App.js', () => ({ App: () => createElement('div', null, 'app') }));

const session = { user: null as unknown, loading: false, privateBeta: true };
vi.mock('./AuthContext.js', () => ({ useAuth: () => session }));

const { BootGate } = await import('./BootGate.js');

async function renderAt(path: string) {
  window.history.replaceState({}, '', path);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(BootGate)));
  // A lazy import resolves a tick later than the first paint.
  await act(async () => {});
  return { text: container.textContent ?? '', root };
}

describe('BootGate', () => {
  it('answers a walled visitor on the home page without loading the app', async () => {
    Object.assign(session, { user: null, loading: false, privateBeta: true });
    const { text, root } = await renderAt('/');
    expect(text).toBe('splash:');
    root.unmount();
  });

  it('carries the code through on an invite link', async () => {
    Object.assign(session, { user: null, loading: false, privateBeta: true });
    const code = 'A'.repeat(32);
    const { text, root } = await renderAt(`/invite/${code}`);
    expect(text).toBe(`splash:${code}`);
    root.unmount();
  });

  it.each(['/legal/terms', '/contact', '/creator/ada', '/proposals', '/nothing-here'])(
    'loads the app for %s, which renders signed-out',
    async (path) => {
      Object.assign(session, { user: null, loading: false, privateBeta: true });
      const { text, root } = await renderAt(path);
      expect(text).toBe('app');
      root.unmount();
    },
  );

  it('loads the app for a signed-in visitor', async () => {
    Object.assign(session, { user: { uid: 'g:someone' }, loading: false, privateBeta: true });
    const { text, root } = await renderAt('/');
    expect(text).toBe('app');
    root.unmount();
  });

  it('loads the app when the site is open', async () => {
    Object.assign(session, { user: null, loading: false, privateBeta: false });
    const { text, root } = await renderAt('/');
    expect(text).toBe('app');
    root.unmount();
  });

  it('waits rather than guessing while the session is still loading', async () => {
    Object.assign(session, { user: null, loading: true, privateBeta: true });
    const { text, root } = await renderAt('/');
    expect(text).toBe('loading');
    root.unmount();
  });
});
