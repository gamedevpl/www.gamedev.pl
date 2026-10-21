// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

const auth = vi.hoisted(() => ({ appleLinked: true, dismissAppleLinked: vi.fn() }));

vi.mock('./AuthContext.js', () => ({ useAuth: () => auth }));

let container: HTMLDivElement;
let root: Root;

async function render() {
  const { AppleLinkedNotice } = await import('./AppleLinkedNotice.js');
  await act(async () => {
    root.render(createElement(AppleLinkedNotice));
  });
}

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  auth.appleLinked = true;
  auth.dismissAppleLinked = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('AppleLinkedNotice', () => {
  it('confirms the link and can be closed', async () => {
    await render();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Apple ID is now linked');
    await act(async () => container.querySelector('button')?.click());
    expect(auth.dismissAppleLinked).toHaveBeenCalled();
  });

  it('dismisses itself after a few seconds', async () => {
    vi.useFakeTimers();
    await render();
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(auth.dismissAppleLinked).toHaveBeenCalled();
  });

  it('renders nothing without a fresh link', async () => {
    auth.appleLinked = false;
    await render();
    expect(container.innerHTML).toBe('');
  });
});
