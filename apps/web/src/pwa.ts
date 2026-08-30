/**
 * When — and whether — to suggest installing the app (mobile-app-plan.md M1 (private www.gamedev.pl-ops repo)).
 *
 * Installing matters here beyond convenience: on iOS, an installed app is the *only*
 * way Safari will deliver Web Push, so a creator who wants to know their game went live
 * cannot get that notification until they add the app to their home screen. That is a
 * real reason to ask, and it is also the reason not to ask badly — a nag that gets
 * dismissed reflexively costs the one prompt that mattered.
 *
 * The rules below come from the plan's open question 1 ("nudge only after a repeat
 * visit") and from what the two platforms actually allow:
 *
 * - **Never to someone already installed.** Nothing to offer.
 * - **Never on a first visit.** A stranger has no reason to want this on their home
 *   screen yet, and the browser's own heuristics agree — Chrome withholds
 *   `beforeinstallprompt` from drive-by visits too.
 * - **Never to a controller guest.** A phone that scanned a lobby QR is here for the
 *   next ten minutes of someone else's party. Zero friction is the whole point of that
 *   route, so `InstallPrompt` is simply not mounted on it.
 * - **Dismissal sticks.** For a month, after which the situation may genuinely have
 *   changed (they have games of their own now, and notifications to want).
 */

import { readStorageItem, writeStorageItem } from './core/persistence.js';

const VISITS_KEY = 'gamedev_pwa_visits';
const VISIT_COUNTED_KEY = 'gamedev_pwa_visit_counted';
const DISMISSED_KEY = 'gamedev_pwa_install_dismissed_at';

/** A repeat visitor is someone on their second session or later. */
export const MIN_VISITS_BEFORE_PROMPT = 2;

/** How long a dismissal holds before the offer may return. */
export const DISMISSAL_TTL_MS = 30 * 24 * 60 * 60_000;

/**
 * An install nudge is the last thing that should be able to break a page render.
 * `window` itself may not exist (SSR, a plain Node test) — resolved inside a try,
 * same as readStorageItem/writeStorageItem guard the storage object itself.
 */
function resolveStorage(storage: 'local' | 'session'): Storage | undefined {
  try {
    return storage === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function readStorage(storage: 'local' | 'session', key: string): string | null {
  const target = resolveStorage(storage);
  return target ? readStorageItem(key, target) : null;
}

function writeStorage(storage: 'local' | 'session', key: string, value: string): void {
  const target = resolveStorage(storage);
  if (target) writeStorageItem(key, value, target);
}

/**
 * Count this session, once, and return how many sessions this browser has had.
 *
 * Counted per *session*, not per page load: a reload, a deep link opened from a
 * notification, and a bounce back from an OAuth redirect are all the same visit, and
 * counting them separately would turn "repeat visitor" into "reloaded twice".
 */
export function recordVisit(): number {
  const previous = Number.parseInt(readStorage('local', VISITS_KEY) ?? '', 10);
  const visits = Number.isFinite(previous) && previous > 0 ? previous : 0;

  if (readStorage('session', VISIT_COUNTED_KEY)) {
    return visits;
  }

  const next = visits + 1;
  writeStorage('session', VISIT_COUNTED_KEY, '1');
  writeStorage('local', VISITS_KEY, String(next));
  return next;
}

export function installDismissedAt(): number | null {
  const parsed = Number.parseInt(readStorage('local', DISMISSED_KEY) ?? '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function dismissInstall(now: number = Date.now()): void {
  writeStorage('local', DISMISSED_KEY, String(now));
}

/** Already installed: standalone display mode, or iOS's own pre-manifest flag. */
export function isStandalone(): boolean {
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (iosStandalone) return true;
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    // jsdom and very old browsers have no matchMedia; not standalone is the safe read.
    return false;
  }
}

export interface InstallEligibility {
  visits: number;
  dismissedAt: number | null;
  now: number;
  standalone: boolean;
}

export function shouldOfferInstall({ visits, dismissedAt, now, standalone }: InstallEligibility): boolean {
  if (standalone) return false;
  if (visits < MIN_VISITS_BEFORE_PROMPT) return false;
  if (dismissedAt !== null && now - dismissedAt < DISMISSAL_TTL_MS) return false;
  return true;
}

/** iPhone, iPod, or an iPad — which since iPadOS 13 introduces itself as a Mac. */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/**
 * True where the "Add to Home Screen" instructions we show are actually correct.
 *
 * iOS has no `beforeinstallprompt`, so the only thing an app can do is describe the
 * Share-sheet route by hand — which means being sure the reader has that Share sheet.
 * Third-party iOS browsers render with WebKit but wrap it in their own UI, and the
 * embedded browsers inside Facebook, Instagram and the like cannot install at all.
 * Telling any of them to "tap Share, then Add to Home Screen" is instructions for a
 * button that isn't there, so they are told nothing instead.
 */
export function isIosInstallCandidate(userAgent: string, maxTouchPoints: number): boolean {
  if (!isIosDevice(userAgent, maxTouchPoints)) return false;
  if (/crios|fxios|edgios|opios|brave/i.test(userAgent)) return false;
  if (/fban|fbav|instagram|line\/|micromessenger|wv\)/i.test(userAgent)) return false;
  return /safari/i.test(userAgent);
}

/**
 * Chrome's install offer, held for later.
 *
 * `beforeinstallprompt` fires while the page is still loading — reliably before React has
 * mounted anything — and the event is only useful if `preventDefault()` was called on it
 * synchronously. A component that subscribes on mount is therefore always too late, and
 * the earlier version of this app had exactly that bug in the form of no prompt at all.
 * So the listener is installed from `main.tsx` at boot and parks the event here; the
 * component asks what is waiting and subscribes for anything that arrives after.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(event: BeforeInstallPromptEvent | null) => void>();

function publishPrompt(event: BeforeInstallPromptEvent | null): void {
  deferredPrompt = event;
  for (const listener of promptListeners) listener(event);
}

let watching = false;

export function watchInstallPrompt(): void {
  // Idempotent: main.tsx calls this once, but a second call must not double up the
  // listeners and publish every offer twice.
  if (watching) return;
  watching = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's own mini-infobar. We make the same offer, but on our terms:
    // later, once, and only to someone who has been here before.
    event.preventDefault();
    publishPrompt(event as BeforeInstallPromptEvent);
  });

  // Fires however the install happened — our button, the browser's menu, or the OS.
  window.addEventListener('appinstalled', () => publishPrompt(null));
}

export function pendingInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

/** A `prompt()`ed event is spent — the browser refuses a second call on the same one. */
export function clearInstallPrompt(): void {
  publishPrompt(null);
}

export function subscribeInstallPrompt(listener: (event: BeforeInstallPromptEvent | null) => void): () => void {
  promptListeners.add(listener);
  return () => {
    promptListeners.delete(listener);
  };
}

/** Sessions this browser has had, without counting the current one if it is new. */
export function visitCount(): number {
  const parsed = Number.parseInt(readStorage('local', VISITS_KEY) ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
