// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DISMISSAL_TTL_MS,
  dismissInstall,
  installDismissedAt,
  isIosDevice,
  isIosInstallCandidate,
  MIN_VISITS_BEFORE_PROMPT,
  recordVisit,
  shouldOfferInstall,
  visitCount,
} from './pwa.js';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const DESKTOP_MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recordVisit', () => {
  it('counts the first session', () => {
    expect(recordVisit()).toBe(1);
    expect(visitCount()).toBe(1);
  });

  it('counts a session once, however many times it is called', () => {
    // A reload, an OAuth bounce-back and a notification deep link are one visit, not
    // three — otherwise "repeat visitor" degrades into "reloaded twice".
    recordVisit();
    recordVisit();
    recordVisit();

    expect(visitCount()).toBe(1);
  });

  it('counts a later session separately', () => {
    recordVisit();
    window.sessionStorage.clear(); // a new tab / a fresh launch

    expect(recordVisit()).toBe(2);
  });

  it('survives storage that throws, as Safari private mode does', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    // Never throws: an install nudge must not be able to break a page render.
    expect(() => recordVisit()).not.toThrow();
    expect(visitCount()).toBe(0);
  });

  it('treats a corrupted counter as no visits rather than NaN', () => {
    window.localStorage.setItem('gamedev_pwa_visits', 'not-a-number');

    expect(recordVisit()).toBe(1);
  });
});

describe('dismissal', () => {
  it('remembers when the offer was refused', () => {
    dismissInstall(1_000);
    expect(installDismissedAt()).toBe(1_000);
  });

  it('reports nothing when never dismissed', () => {
    expect(installDismissedAt()).toBeNull();
  });
});

describe('shouldOfferInstall', () => {
  const base = { visits: MIN_VISITS_BEFORE_PROMPT, dismissedAt: null, now: 1_000_000, standalone: false };

  it('offers to a repeat visitor who has not dismissed it', () => {
    expect(shouldOfferInstall(base)).toBe(true);
  });

  it('never offers to someone already running the installed app', () => {
    expect(shouldOfferInstall({ ...base, standalone: true })).toBe(false);
  });

  it('never offers on a first visit', () => {
    expect(shouldOfferInstall({ ...base, visits: 1 })).toBe(false);
  });

  it('stays quiet for a month after a dismissal', () => {
    const dismissedAt = base.now - DISMISSAL_TTL_MS + 1;
    expect(shouldOfferInstall({ ...base, dismissedAt })).toBe(false);
  });

  it('may ask again once the dismissal has aged out', () => {
    const dismissedAt = base.now - DISMISSAL_TTL_MS - 1;
    expect(shouldOfferInstall({ ...base, dismissedAt })).toBe(true);
  });

  it('keeps quiet for an installed app even if the dismissal expired', () => {
    expect(shouldOfferInstall({ ...base, standalone: true, dismissedAt: 0 })).toBe(false);
  });
});

describe('isIosDevice', () => {
  it('recognises an iPhone', () => {
    expect(isIosDevice(IPHONE_SAFARI, 5)).toBe(true);
  });

  it('recognises an iPad, which introduces itself as a Mac', () => {
    expect(isIosDevice(IPAD_SAFARI, 5)).toBe(true);
  });

  it('does not mistake a desktop Mac for an iPad', () => {
    expect(isIosDevice(DESKTOP_MAC_SAFARI, 0)).toBe(false);
  });

  it('is false on Android', () => {
    expect(isIosDevice(ANDROID_CHROME, 5)).toBe(false);
  });
});

describe('isIosInstallCandidate', () => {
  it('is true in iOS Safari, where the Share-sheet instructions are correct', () => {
    expect(isIosInstallCandidate(IPHONE_SAFARI, 5)).toBe(true);
  });

  it('is false on Android, which gets a real install event instead', () => {
    expect(isIosInstallCandidate(ANDROID_CHROME, 5)).toBe(false);
  });

  it.each([
    ['Chrome for iOS', `${IPHONE_SAFARI.replace('Safari/604.1', 'CriOS/126.0 Mobile/15E148 Safari/604.1')}`],
    ['Firefox for iOS', `${IPHONE_SAFARI.replace('Safari/604.1', 'FxiOS/127.0 Mobile/15E148 Safari/604.1')}`],
    ['Edge for iOS', `${IPHONE_SAFARI.replace('Safari/604.1', 'EdgiOS/126.0 Mobile/15E148 Safari/604.1')}`],
  ])('is false in %s, which has a different Share sheet', (_name, userAgent) => {
    expect(isIosInstallCandidate(userAgent, 5)).toBe(false);
  });

  it.each([
    ['Facebook', `${IPHONE_SAFARI} [FBAN/FBIOS;FBAV/470.0]`],
    ['Instagram', `${IPHONE_SAFARI} Instagram 300.0.0.0`],
  ])('is false inside the %s in-app browser, which cannot install at all', (_name, userAgent) => {
    // Telling someone to tap a Share button that their webview does not have is worse
    // than saying nothing.
    expect(isIosInstallCandidate(userAgent, 5)).toBe(false);
  });
});
