/**
 * Constants shared between globalSetup and the test workers.
 *
 * Deliberately its own module with **no `vitest` import**. `globalSetup` runs in a
 * different context from the workers, and importing `vitest` there fails outright
 * ("Vitest failed to access its internal state"). `browser.ts` imports `inject`, so
 * anything globalSetup needs has to live somewhere that does not drag that in.
 */

export const BASE_URL = process.env.E2E_BASE_URL ?? 'https://www.gamedev.pl';

/** Key under which globalSetup publishes the once-per-run session state path. */
export const STORAGE_STATE_ENV = 'E2E_STORAGE_STATE';

/**
 * Proxy options for `request.newContext`, when egress goes through a CONNECT proxy.
 *
 * `launchSiteBrowser` already does this for Chromium, but Playwright's **API** contexts
 * need it too and are easy to miss: they do not read `HTTPS_PROXY` from the environment
 * either, so in a proxied sandbox they bypass it, get a proxy `403`, and the failure
 * reads as the site rejecting the credential. Lives here rather than in `browser.ts`
 * because `globalSetup` runs in a context where importing that module (and through it,
 * vitest) fails outright.
 *
 * No TLS cap needed here, unlike the browser: that workaround exists for Chromium's
 * TLS 1.3 ClientHello, and Node's HTTP client does not trip it.
 */
export function proxyOptions(): { proxy?: { server: string } } {
  const server = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  return server ? { proxy: { server } } : {};
}
