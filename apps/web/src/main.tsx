import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { AuthProvider } from './AuthContext.js';
import { recordVisit, watchInstallPrompt } from './pwa.js';
import { hasServiceWorkerSupport } from './serviceWorkerSupport.js';
import { watchShellUpdates } from './shellUpdate.js';
import { startVisitTracking } from './visitTelemetry.js';
import { i18nReady } from './i18n/index.js';
import './styles.css';

// Started before the first render: the visit has to be recorded as it lands, and a tree
// that has already chosen a route has passed the moment being measured.
startVisitTracking();

/*
 * Both of these have to happen at boot rather than from the component that uses them.
 *
 * `watchInstallPrompt` because Chrome fires `beforeinstallprompt` during load and only
 * honours a synchronous `preventDefault()`; a listener attached on mount never sees it.
 *
 * `recordVisit` because "has this person been here before" must count every session,
 * including the ones spent on the beta splash or a controller page — routes where the
 * install banner deliberately never renders and so could never do the counting itself.
 *
 * `watchShellUpdates` for the same timing reason as the install prompt: the worker can
 * activate and post `shell-updated` while the auth splash is still up, long before
 * `AppUpdateBanner` mounts. Without an early listener the message is gone and an
 * iPhone Home Screen reopen stays on a stale shell with no Reload offer.
 */
watchInstallPrompt();
recordVisit();
watchShellUpdates();

// Clears the index.html boot watchdog — React is about to replace #root.
const booted = (window as Window & { __gamedevBooted?: () => void }).__gamedevBooted;
if (typeof booted === 'function') booted();

// An async IIFE rather than a top-level await: the build targets Safari 14 / Chrome 87,
// which predate top-level await in a module. Waits for the active locale's own
// translations — and only that locale's — to be loaded, the same guarantee the old
// both-locales-bundled i18n import gave for free.
void (async () => {
  await i18nReady;

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>,
  );
})();

/*
 * Register the worker for everyone, not just people who turn on notifications.
 *
 * pushApi registers it too, but only from the opt-in flow — and a browser will not
 * offer to install an app whose pages no service worker is controlling. Leaving
 * registration to the notification bell meant the install prompt appeared only for
 * users who had already accepted notifications, which is backwards: on iOS,
 * installing is what makes notifications possible in the first place.
 *
 * After `load` so it never competes with the first render for bandwidth. Registering
 * twice is harmless — the browser dedupes by script URL and scope.
 */
if (hasServiceWorkerSupport()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // A blocked or unsupported worker costs the install prompt and offline page,
      // nothing else. The app itself does not depend on it.
    });
  });
}
