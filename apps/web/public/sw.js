/* Web Push service worker (docs/notifications-plan.md M2), plus the minimum an
 * installable app needs.
 *
 * Served from the site root (apps/web/public/sw.js → /sw.js) so its scope covers the
 * whole app.
 *
 * On caching: this still caches no application code. The only cached document is
 * /offline.html, shown when a navigation fails with the network down — Chrome will not
 * offer to install an app whose service worker has no fetch handler and cannot answer
 * offline. Caching index.html or the hashed bundles instead would make the worker the
 * thing that decides which version of the app a returning user gets, and a stale shell
 * is a far worse failure than a missing offline page.
 */
const OFFLINE_CACHE = 'offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      // reload: skip the HTTP cache, so a redeploy of the page is picked up here.
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== OFFLINE_CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  // Only page loads. Everything else — the bundles, the API, the games — goes
  // straight to the network as if this worker were not here.
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request);
      } catch {
        return (await caches.match(OFFLINE_URL)) ?? Response.error();
      }
    })(),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Malformed payload — show a generic ping rather than nothing.
    data = {};
  }

  const title = data.title || 'gamedev.pl';
  const options = {
    body: data.body || '',
    // Without these the OS falls back to the browser's own logo, which reads as a
    // notification from Chrome rather than one from the app the user installed.
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag, // same tag coalesces repeat pings for one event
    // Re-alert (banner/sound) even when a notification with this tag already
    // exists — otherwise a same-tag repeat updates silently. Requires a tag.
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Prefer an already-open tab on our origin: focus it and navigate to the
      // target URL, so a click doesn't spawn a duplicate tab.
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            await client.focus();
          } catch {
            /* focus can reject if the tab is gone; fall through to openWindow */
          }
          if ('navigate' in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              /* cross-origin or detached — ignore, the focus already helped */
            }
          }
          return;
        }
      }
      // No open tab: open a fresh one at the target.
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
