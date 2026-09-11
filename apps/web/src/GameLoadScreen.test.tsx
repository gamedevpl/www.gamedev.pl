// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameLoadScreen } from './GameLoadScreen.js';
import i18n from './i18n/index.js';

describe('GameLoadScreen download bar', () => {
  let container: HTMLDivElement;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('shows an indeterminate bar before Content-Length is known', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<GameLoadScreen progress={{ loaded: 0, total: null }} />);
    });
    const bar = container.querySelector('.app-loading-screen__bar');
    expect(bar?.classList.contains('is-indeterminate')).toBe(true);
    expect(bar?.getAttribute('aria-valuenow')).toBeNull();
    expect(container.textContent).toMatch(/loading game/i);
    await act(async () => root.unmount());
  });

  it('fills the bar and names the bytes once a total is known', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<GameLoadScreen progress={{ loaded: 12 * 1024 * 1024, total: 24 * 1024 * 1024 }} />);
    });
    const bar = container.querySelector('.app-loading-screen__bar');
    expect(bar?.classList.contains('is-indeterminate')).toBe(false);
    expect(bar?.getAttribute('aria-valuenow')).toBe('50');
    expect(container.querySelector('.app-loading-screen__bar-fill')?.getAttribute('style')).toMatch(/width:\s*50%/);
    expect(container.querySelector('.app-loading-screen__size')?.textContent).toBe('12 MB / 24 MB');
    await act(async () => root.unmount());
  });
});
