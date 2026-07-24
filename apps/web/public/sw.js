/* Web Push service worker (docs/notifications-plan.md M2).
 *
 * Deliberately tiny: it only relays push messages to the OS and routes a click
 * back into the app. It caches nothing and does not intercept fetches — this is a
 * notification worker, not an offline/PWA worker. Served from the site root
 * (apps/web/public/sw.js → /sw.js) so its scope covers the whole app.
 */

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
    tag: data.tag, // same tag coalesces repeat pings for one event
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
      // Prefer an already-open tab on our origin: focus it and hand it the target
      // hash route, so a click doesn't spawn a duplicate tab.
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
