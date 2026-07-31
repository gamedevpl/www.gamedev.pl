// @vitest-environment jsdom

import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The GIS widget must paint once and stay put. Inline onError from ClosedBetaSplash
 * (and a fresh signInWithGoogleToken from AuthProvider after a rejected One Tap) used
 * to re-run the init effect, wipe the container, and shove the Apple button below it.
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

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  it('reserves a fixed slot so the Apple button below does not jump before GIS paints', async () => {
    const { GoogleSignInButton } = await import('./GoogleSignInButton.js');

    await act(async () => {
      root.render(createElement(GoogleSignInButton));
    });

    const slot = container.querySelector('.google-sign-in-container');
    expect(slot).not.toBeNull();
    // Dimensions live in CSS; the class is the contract the stylesheet sizes.
    expect(slot?.className).toBe('google-sign-in-container');
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
