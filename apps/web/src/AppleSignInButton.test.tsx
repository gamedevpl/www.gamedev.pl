// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

/**
 * The behaviour worth pinning is the gate, not the popup.
 *
 * Apple's SDK refuses any origin that is not an https URL registered against the Services
 * ID, so the sign-in itself cannot be driven from a test (or from localhost, or from the
 * browser pane). What *can* go wrong without anyone noticing is the button appearing when
 * it cannot possibly work — which lands on the user as a dead control.
 */

const auth = vi.hoisted(() => ({ appleSignIn: false, signInWithAppleToken: vi.fn() }));

vi.mock('./AuthContext.js', () => ({ useAuth: () => auth }));

let container: HTMLDivElement;
let root: Root;

function button() {
  return container.querySelector('.apple-sign-in-btn');
}

async function render() {
  const { AppleSignInButton } = await import('./AppleSignInButton.js');
  await act(async () => {
    root.render(createElement(AppleSignInButton));
  });
}

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');

  auth.appleSignIn = false;
  auth.signInWithAppleToken = vi.fn();
  vi.stubEnv('VITE_APPLE_SERVICES_ID', '');

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
  document.querySelectorAll('script[src*="appleid"]').forEach((node) => node.remove());
});

describe('AppleSignInButton', () => {
  it('renders nothing when neither half is configured', async () => {
    await render();

    expect(button()).toBeNull();
  });

  it('renders nothing when the build has a Services ID but the API cannot verify', async () => {
    // A web build carrying the ID against a server without APPLE_CLIENT_IDS would show a
    // working-looking button in front of a route that answers 503.
    vi.stubEnv('VITE_APPLE_SERVICES_ID', 'pl.gamedev.web');
    auth.appleSignIn = false;

    await render();

    expect(button()).toBeNull();
  });

  it('renders nothing when the API can verify but the build has no Services ID', async () => {
    // The mirror case: without a client ID the SDK has nothing to init with.
    auth.appleSignIn = true;

    await render();

    expect(button()).toBeNull();
  });

  it('renders once both halves agree', async () => {
    vi.stubEnv('VITE_APPLE_SERVICES_ID', 'pl.gamedev.web');
    auth.appleSignIn = true;

    await render();

    expect(button()).not.toBeNull();
    expect(button()?.textContent).toContain('Apple');
  });

  it('loads Apple’s SDK only when it is going to be used', async () => {
    await render();
    expect(document.querySelector('script[src*="appleid"]')).toBeNull();

    vi.stubEnv('VITE_APPLE_SERVICES_ID', 'pl.gamedev.web');
    auth.appleSignIn = true;
    await render();

    expect(document.querySelector('script[src*="appleid"]')).not.toBeNull();
  });

  it('stays disabled until the SDK has loaded, so a click cannot fall through', async () => {
    vi.stubEnv('VITE_APPLE_SERVICES_ID', 'pl.gamedev.web');
    auth.appleSignIn = true;

    await render();

    expect((button() as HTMLButtonElement).disabled).toBe(true);
  });

  it('carries the Apple mark, which their branding rules require', async () => {
    vi.stubEnv('VITE_APPLE_SERVICES_ID', 'pl.gamedev.web');
    auth.appleSignIn = true;

    await render();

    expect(container.querySelector('.apple-sign-in-mark')).not.toBeNull();
  });
});
