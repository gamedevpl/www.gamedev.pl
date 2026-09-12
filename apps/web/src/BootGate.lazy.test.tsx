// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

// Own file: a module factory runs once per registry.
const appEvaluated = vi.fn();
vi.mock('./App.js', () => {
  appEvaluated();
  return { App: () => createElement('div', null, 'app') };
});
vi.mock('./AppLoadingScreen.js', () => ({ AppLoadingScreen: () => createElement('div', null, 'loading') }));
vi.mock('./ClosedBetaSplash.js', () => ({ ClosedBetaSplash: () => createElement('div', null, 'splash') }));
vi.mock('./AuthContext.js', () => ({ useAuth: () => ({ user: null, loading: false, privateBeta: true }) }));

const { BootGate } = await import('./BootGate.js');

describe('the chunk a walled visitor never fetches', () => {
  it('is not evaluated while the splash is what renders', async () => {
    window.history.replaceState({}, '', '/');
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(BootGate)));
    await act(async () => {});

    expect(container.textContent).toBe('splash');
    expect(appEvaluated).not.toHaveBeenCalled();
    root.unmount();
  });
});
