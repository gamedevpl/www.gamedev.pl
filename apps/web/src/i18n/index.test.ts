// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import i18n, { i18nReady } from './index.js';

describe('i18n.changeLanguage', () => {
  it('persists every successful switch, not only the first load of a bundle', async () => {
    await i18nReady;

    await i18n.changeLanguage('pl');
    expect(localStorage.getItem('gamedevpl:lang')).toBe('pl');

    await i18n.changeLanguage('en');
    expect(localStorage.getItem('gamedevpl:lang')).toBe('en');

    // pl's bundle is already loaded from the first switch above, so this exercises the
    // "bundle already present" branch that used to skip persistence entirely.
    await i18n.changeLanguage('pl');
    expect(localStorage.getItem('gamedevpl:lang')).toBe('pl');
  });

  it('lets the latest switch win over a slower one still fetching its bundle', async () => {
    // A fresh module instance, started from 'en' (jsdom's default navigator.language),
    // so the pl switch below has to go through loadLocale() rather than resolving on
    // the already-loaded fast path a prior test in this file may have warmed up.
    localStorage.clear();
    let resolvePl!: (value: { default: Record<string, unknown> }) => void;
    const plModule = new Promise<{ default: Record<string, unknown> }>((resolve) => {
      resolvePl = resolve;
    });
    vi.doMock('./locales/pl.json', () => plModule);
    vi.resetModules();
    const fresh = await import('./index.js');
    await fresh.i18nReady;
    expect(fresh.default.hasResourceBundle('pl', 'translation')).toBe(false);

    // Click PL (slow — hangs on the unresolved mock), then EN (fast — already loaded).
    const plChange = fresh.default.changeLanguage('pl');
    const enChange = fresh.default.changeLanguage('en');
    await enChange;
    expect(fresh.default.language).toBe('en');

    // The stale PL fetch finally resolves after EN already won.
    resolvePl({ default: { hello: 'cześć' } });
    await plChange;

    expect(fresh.default.language).toBe('en');
    expect(localStorage.getItem('gamedevpl:lang')).toBe('en');

    vi.doUnmock('./locales/pl.json');
    vi.resetModules();
  });

  it('resolves i18nReady without initializing i18next when the startup locale fails to load', async () => {
    localStorage.clear();
    let rejectEn!: (error: unknown) => void;
    const enModule = new Promise<{ default: Record<string, unknown> }>((_resolve, reject) => {
      rejectEn = reject;
    });
    vi.doMock('./locales/en.json', () => enModule);
    vi.resetModules();

    const fresh = await import('./index.js');
    rejectEn(new Error('offline'));
    // Rejecting here — instead of resolving — is exactly the bug: main.tsx clears its
    // boot watchdog before awaiting i18nReady, so an unhandled rejection would leave
    // the page permanently blank instead of rendering (in raw-key fallback). i18next's
    // own module instance is shared across every dynamic reimport in this file (it's a
    // pre-bundled dependency, unaffected by vi.resetModules()), so isInitialized can't
    // be asserted here in isolation — resolving instead of rejecting is the guarantee
    // this test exists to lock in.
    await expect(fresh.i18nReady).resolves.toBeUndefined();

    vi.doUnmock('./locales/en.json');
    vi.resetModules();
  });
});
