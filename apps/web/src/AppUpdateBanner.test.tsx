// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateBanner } from './AppUpdateBanner.js';
import i18n from './i18n/index.js';

let container: HTMLDivElement;
let root: Root;
/** Stands in for `navigator.serviceWorker`, which jsdom does not implement. */
let serviceWorker: EventTarget;

function banner() {
  return container.querySelector('.app-update');
}

/** What the worker posts from `activate` when it replaced an earlier build. */
function postFromWorker(data: unknown) {
  const event = new Event('message') as MessageEvent;
  Object.defineProperty(event, 'data', { value: data });
  serviceWorker.dispatchEvent(event);
}

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');

  serviceWorker = new EventTarget();
  Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker, configurable: true });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(AppUpdateBanner));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
  Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AppUpdateBanner', () => {
  it('stays out of the way until there is actually a new build', async () => {
    expect(banner()).toBeNull();
  });

  it('appears when the worker reports it replaced an earlier build', async () => {
    await act(async () => {
      postFromWorker({ type: 'shell-updated', revision: 'cafef00d' });
    });

    expect(banner()).not.toBeNull();
    expect(container.querySelector('.app-update__text')?.textContent).toBe('A new version of Gamedev.pl is ready.');
  });

  it('ignores worker messages about anything else', async () => {
    await act(async () => {
      postFromWorker({ type: 'something-else' });
      postFromWorker(null);
      postFromWorker('shell-updated');
    });

    expect(banner()).toBeNull();
  });

  it('reloads the page, which is what actually picks up the new shell', async () => {
    const reload = vi.fn();
    // jsdom refuses to navigate, so location.reload is replaced outright.
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
    });

    await act(async () => {
      postFromWorker({ type: 'shell-updated', revision: 'cafef00d' });
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.app-update__reload')?.click();
    });

    expect(reload).toHaveBeenCalledOnce();
  });

  it('can be waved away, leaving the app on the build it already has', async () => {
    await act(async () => {
      postFromWorker({ type: 'shell-updated', revision: 'cafef00d' });
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.app-update__close')?.click();
    });

    expect(banner()).toBeNull();
  });

  it('renders nothing where there is no service worker at all', async () => {
    await act(async () => root.unmount());
    Reflect.deleteProperty(navigator, 'serviceWorker');

    root = createRoot(container);
    // A browser with no worker support must not throw its way through this component.
    await act(async () => {
      root.render(createElement(AppUpdateBanner));
    });

    expect(banner()).toBeNull();
  });
});
