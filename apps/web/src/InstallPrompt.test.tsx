// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallPrompt } from './InstallPrompt.js';
import i18n from './i18n/index.js';
import {
  clearInstallPrompt,
  MIN_VISITS_BEFORE_PROMPT,
  watchInstallPrompt,
  type BeforeInstallPromptEvent,
} from './pwa.js';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

let container: HTMLDivElement;
let root: Root;

/** A stand-in for Chrome's `beforeinstallprompt`, which jsdom knows nothing about. */
function makeInstallEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent & {
    prompt: ReturnType<typeof vi.fn>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(event, 'userChoice', { value: Promise.resolve({ outcome, platform: 'web' }) });
  return event;
}

/**
 * Own properties rather than `vi.spyOn`: jsdom's Navigator has no `maxTouchPoints` at
 * all, so there is no accessor to spy on. Both are configurable, so a later call in the
 * same test replaces them and `afterEach` can remove them again.
 */
function setUserAgent(userAgent: string, maxTouchPoints = 5) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

/** jsdom has no matchMedia; the component treats a missing one as "not installed". */
function setStandalone(standalone: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: standalone, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

async function render() {
  await act(async () => {
    root.render(createElement(InstallPrompt));
  });
}

function banner() {
  return container.querySelector('.install-prompt');
}

function installButton() {
  return container.querySelector<HTMLButtonElement>('.install-prompt__install');
}

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  window.localStorage.clear();
  window.sessionStorage.clear();
  // A repeat visitor by default; the individual tests vary what they need to.
  window.localStorage.setItem('gamedev_pwa_visits', String(MIN_VISITS_BEFORE_PROMPT));
  setStandalone(false);
  setUserAgent(ANDROID_CHROME);
  watchInstallPrompt();
  // The parked offer is module state that outlives a test, exactly as it outlives a
  // route change in the real app. Reset it so each test starts with nothing on offer.
  clearInstallPrompt();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
  // Drop the own properties `setUserAgent` shadowed jsdom's Navigator with, so the
  // next test starts from the real one.
  Reflect.deleteProperty(navigator, 'userAgent');
  Reflect.deleteProperty(navigator, 'maxTouchPoints');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('InstallPrompt eligibility', () => {
  it('renders nothing to a first-time visitor', async () => {
    window.localStorage.setItem('gamedev_pwa_visits', '1');

    await render();
    window.dispatchEvent(makeInstallEvent());
    await act(async () => {});

    expect(banner()).toBeNull();
  });

  it('renders nothing inside the already-installed app', async () => {
    setStandalone(true);

    await render();
    window.dispatchEvent(makeInstallEvent());
    await act(async () => {});

    expect(banner()).toBeNull();
  });

  it('renders nothing while a dismissal is still fresh', async () => {
    window.localStorage.setItem('gamedev_pwa_install_dismissed_at', String(Date.now()));

    await render();
    window.dispatchEvent(makeInstallEvent());
    await act(async () => {});

    expect(banner()).toBeNull();
  });

  it('renders nothing on Android until the browser actually offers an install', async () => {
    // Chrome withholds `beforeinstallprompt` when the app is already installed or the
    // engagement heuristics are not met. Showing an Install button in that state would
    // be a button that cannot do anything.
    await render();

    expect(banner()).toBeNull();
  });
});

describe('InstallPrompt on Android', () => {
  it('appears once the browser offers an install', async () => {
    await render();

    await act(async () => {
      window.dispatchEvent(makeInstallEvent());
    });

    expect(banner()).not.toBeNull();
    expect(installButton()?.textContent).toBe('Install');
  });

  it('picks up an offer that arrived before it mounted', async () => {
    // The real ordering: `beforeinstallprompt` fires during page load, long before
    // React renders anything. main.tsx parks it, and the component collects it here.
    await act(async () => {
      window.dispatchEvent(makeInstallEvent());
    });

    await render();

    expect(banner()).not.toBeNull();
  });

  it('opens the OS install dialog and then gets out of the way', async () => {
    const event = makeInstallEvent('accepted');
    await render();
    await act(async () => {
      window.dispatchEvent(event);
    });

    await act(async () => {
      installButton()?.click();
    });

    expect(event.prompt).toHaveBeenCalledOnce();
    expect(banner()).toBeNull();
    // Accepting needs no dismissal record — the installed app answers for itself.
    expect(window.localStorage.getItem('gamedev_pwa_install_dismissed_at')).toBeNull();
  });

  it('treats declining the OS dialog as a dismissal', async () => {
    const event = makeInstallEvent('dismissed');
    await render();
    await act(async () => {
      window.dispatchEvent(event);
    });

    await act(async () => {
      installButton()?.click();
    });

    expect(banner()).toBeNull();
    expect(window.localStorage.getItem('gamedev_pwa_install_dismissed_at')).not.toBeNull();
  });

  it('remembers a dismissal from the close button', async () => {
    await render();
    await act(async () => {
      window.dispatchEvent(makeInstallEvent());
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.install-prompt__close')?.click();
    });

    expect(banner()).toBeNull();
    expect(window.localStorage.getItem('gamedev_pwa_install_dismissed_at')).not.toBeNull();
  });

  it('disappears when the app gets installed some other way', async () => {
    await render();
    await act(async () => {
      window.dispatchEvent(makeInstallEvent());
    });
    expect(banner()).not.toBeNull();

    // Installed from Chrome's own menu rather than our button.
    await act(async () => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(banner()).toBeNull();
  });
});

describe('InstallPrompt on iOS', () => {
  beforeEach(() => {
    setUserAgent(IPHONE_SAFARI);
  });

  it('shows Share-sheet instructions without waiting for an event that never comes', async () => {
    await render();

    const steps = container.querySelectorAll('.install-prompt__steps li');
    expect(steps).toHaveLength(2);
    expect(steps[0]?.textContent).toContain('Share');
    expect(steps[1]?.textContent).toContain('Add to Home Screen');
  });

  it('offers no Install button, because iOS gives no way to trigger one', async () => {
    await render();

    expect(banner()).not.toBeNull();
    expect(installButton()).toBeNull();
  });

  it('is still dismissible', async () => {
    await render();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.install-prompt__close')?.click();
    });

    expect(banner()).toBeNull();
    expect(window.localStorage.getItem('gamedev_pwa_install_dismissed_at')).not.toBeNull();
  });

  it('says nothing in an iOS browser whose Share sheet works differently', async () => {
    setUserAgent(IPHONE_SAFARI.replace('Safari/604.1', 'CriOS/126.0 Mobile/15E148 Safari/604.1'));

    await render();

    expect(banner()).toBeNull();
  });
});
