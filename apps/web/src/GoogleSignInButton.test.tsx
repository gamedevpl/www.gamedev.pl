// @vitest-environment jsdom

import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

/**
 * The GIS widget must paint once and stay put. Inline onError from ClosedBetaSplash
 * (and a fresh signInWithGoogleToken from AuthProvider after a rejected One Tap) used
 * to re-run the init effect, wipe the container, and shove the Apple button below it.
 *
 * The visible control is our black face; GIS sits opacity:0 on top so the dark-scheme
 * white iframe envelope never shows.
 */

const auth = vi.hoisted(() => ({
  signInWithGoogleToken: vi.fn(async () => {
    throw new Error('private beta — sign-ups are closed');
  }),
}));

vi.mock('./AuthContext.js', () => ({ useAuth: () => auth }));

type GisApi = {
  initialize: ReturnType<typeof vi.fn>;
  renderButton: ReturnType<typeof vi.fn>;
  prompt: ReturnType<typeof vi.fn>;
  disableAutoSelect: ReturnType<typeof vi.fn>;
  callback: ((res: { credential: string }) => void) | null;
};

let gis: GisApi;
let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');

  gis = {
    initialize: vi.fn((config: { callback: (res: { credential: string }) => void }) => {
      gis.callback = config.callback;
    }),
    renderButton: vi.fn((parent: HTMLElement) => {
      const marker = document.createElement('span');
      marker.dataset.gis = 'btn';
      parent.appendChild(marker);
    }),
    prompt: vi.fn(),
    disableAutoSelect: vi.fn(),
    callback: null,
  };

  (globalThis as unknown as { google: unknown }).google = {
    accounts: { id: gis },
  };

  auth.signInWithGoogleToken = vi.fn(async () => {
    throw new Error('private beta — sign-ups are closed');
  });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete (globalThis as { google?: unknown }).google;
  vi.restoreAllMocks();
});

describe('GoogleSignInButton', () => {
  it('draws a black face and hides the GIS iframe so no white envelope shows', async () => {
    const { GoogleSignInButton } = await import('./GoogleSignInButton.js');

    await act(async () => {
      root.render(createElement(GoogleSignInButton));
    });

    expect(container.querySelector('.google-sign-in')).not.toBeNull();
    expect(container.querySelector('.google-sign-in-face')).not.toBeNull();
    expect(container.querySelector('.google-sign-in-gis')).not.toBeNull();
    expect(container.querySelector('.google-sign-in-face')?.textContent).toMatch(/Sign in with Google/i);
    expect(container.querySelector('.google-sign-in-mark')).not.toBeNull();
    expect(gis.renderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ locale: 'en', theme: 'filled_black', width: 240 }),
    );
  });

  it('passes a Polish locale to GIS when the UI language is pl', async () => {
    await i18n.changeLanguage('pl');
    const { GoogleSignInButton } = await import('./GoogleSignInButton.js');

    await act(async () => {
      root.render(createElement(GoogleSignInButton));
    });

    expect(gis.renderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ locale: 'pl' }),
    );
    expect(container.querySelector('.google-sign-in-face')?.textContent).toMatch(/Zaloguj się przez Google/i);
  });

  it('does not wipe and re-render the GIS button when the parent passes a new onError', async () => {
    const { GoogleSignInButton } = await import('./GoogleSignInButton.js');

    function Host() {
      const [tick, setTick] = useState(0);
      return createElement(
        'div',
        null,
        createElement(GoogleSignInButton, {
          // New function identity every render — the bug that cleared the widget.
          onError: () => {
            void tick;
          },
        }),
        createElement('button', { type: 'button', id: 'rerender', onClick: () => setTick((n) => n + 1) }, 'x'),
      );
    }

    await act(async () => {
      root.render(createElement(Host));
    });

    expect(gis.renderButton).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-gis="btn"]')).not.toBeNull();

    await act(async () => {
      container.querySelector('#rerender')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(gis.renderButton).toHaveBeenCalledTimes(1);
    expect(gis.initialize).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-gis="btn"]')).not.toBeNull();
  });

  it('keeps the painted button after a rejected One Tap updates parent state', async () => {
    const { GoogleSignInButton } = await import('./GoogleSignInButton.js');

    function Host() {
      const [, setErr] = useState<string | null>(null);
      return createElement(GoogleSignInButton, {
        onError: (msg) => setErr(msg),
      });
    }

    await act(async () => {
      root.render(createElement(Host));
    });

    expect(gis.callback).not.toBeNull();
    expect(gis.renderButton).toHaveBeenCalledTimes(1);

    await act(async () => {
      await gis.callback!({ credential: 'tok' });
    });

    expect(gis.disableAutoSelect).toHaveBeenCalled();
    // Parent setState from onError must not trigger a second renderButton / blank flash.
    expect(gis.renderButton).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-gis="btn"]')).not.toBeNull();
  });
});
