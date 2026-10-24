// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./AuthContext.js', () => ({ useAuth: () => ({ user: null, loading: false, privateBeta: true }) }));
vi.mock('./App.js', () => ({
  App: () => {
    throw new Error('chunk unavailable');
  },
}));

const { BootGate } = await import('./BootGate.js');

describe('boot fallback without a locale bundle', () => {
  it.each(['en', 'pl'])('offers readable recovery in %s when both imports fail', async (language) => {
    const i18n = createInstance();
    await i18n.init({ lng: language, fallbackLng: false, resources: {} });
    window.history.replaceState({}, '', '/play/ink-and-fury');
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(I18nextProvider, { i18n }, createElement(BootGate))));
      expect(container.textContent).not.toContain('app.');
      expect(container.textContent).toContain(language === 'pl' ? 'Nie udało się' : 'This page could not load');
      expect(container.querySelector('button')?.textContent).toBe(language === 'pl' ? 'Odśwież' : 'Reload');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      consoleError.mockRestore();
    }
  });
});
