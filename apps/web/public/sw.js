/* Service worker: the installed app's shell cache (docs/mobile-app-plan.md M1) and Web
 * Push delivery (docs/notifications-plan.md M2).
 *
 * Served from the site root (apps/web/public/sw.js → /sw.js) so its scope covers the
 * whole app.
 *
 * ON CACHING. An earlier version of this file cached nothing but the offline page, on
 * the reasoning that "a stale shell is a far worse failure than a missing offline page".
 * That reasoning was right about the danger and wrong about the conclusion, and M1's exit
 * criterion — an installed app that renders in under a second on a cold API — cannot be
 * met by going to the network for the document first, because a cold Cloud Run instance
 * takes seconds to answer. So the shell is precached, and the staleness the old comment
 * feared is addressed head-on instead of avoided:
 *
 *   1. Each build's shell is cached whole, under a cache named for that build's revision.
 *      index.html and the exact hashed assets it references are installed together and
 *      swapped together, so a cached document can never reference a bundle that a deploy
 *      has since removed from the server.
 *   2. The manifest is baked into this file (src/shellPrecache.ts), so every deploy makes
 *      this worker byte-different and no browser's update check can fail to notice.
 *   3. When an updated worker takes over, it tells the open pages, which offer a reload
 *      (AppUpdateBanner.tsx). A stale shell therefore lasts one navigation and says so,
 *      rather than lasting indefinitely and staying silent.
 *
 * What is NOT cached, ever: anything under /api — the catalog, published game HTML, game
 * media, telemetry — and anything cross-origin. Games stay sandboxed and served fresh;
 * this worker must never become a second, invisible copy of the games repo.
 */

// Replaced at build time with the real asset list. Left inert here so the worker runs
// as-is in dev, where the "bundle" is a live module graph that must never be cached.
const BUILD = { revision: 'dev', shell: [], deferred: [] }; // __BUILD_MANIFEST__

// Must match CACHE_PREFIX in src/shellPrecache.ts (asserted by shellPrecache.test.ts).
const CACHE_PREFIX = 'gamedevpl-shell-';
const CACHE = CACHE_PREFIX + BUILD.revision;

const SHELL_URL = '/index.html';
const OFFLINE_URL = '/offline.html';

/** False in dev and in any build whose manifest injection did not run. */
const hasPrecache = BUILD.shell.length > 0;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const urls = hasPrecache ? BUILD.shell : [OFFLINE_URL];

      // `reload` skips the HTTP cache, so the precache is filled from the deploy that
      // this worker was built for rather than from whatever the browser had lying around.
      //
      // Deliberately not tolerant of a single failure: if any part of the shell cannot be
      // fetched, installation fails, this worker never activates, and the previous one
      // keeps serving. A half-populated shell cache would be a cache-first strategy
      // pointing at holes — worse than no precache at all. The browser retries later.
      await Promise.all(
        urls.map((url) =>
          isDocument(url) ? putDocument(cache, url) : cache.add(new Request(url, { cache: 'reload' })),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      // Keep the previous shell cache until clients have moved on. Deleting it
      // immediately under a page that still has the old index.html (clients.claim
      // mid-session, or a cold open racing an update) is the stuck-white path:
      // HTML references hashed assets that are gone from Cache Storage and from
      // the origin. One prior revision is enough for that race to heal.
      const priorShell = names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE).sort();
      const keepPrior = priorShell.slice(-1);
      const stale = names.filter((name) => name !== CACHE && !keepPrior.includes(name));
      await Promise.all(stale.map((name) => caches.delete(name)));
      await self.clients.claim();

      // Only tell anyone when this really is a *replacement*. A first install — including
      // the upgrade from the old offline-only worker, whose cache used a different name —
      // has nothing to announce, and offering someone a reload of the page they just
      // opened is a bug that looks like a feature.
      if (priorShell.length > 0) {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          client.postMessage({ type: 'shell-updated', revision: BUILD.revision });
        }
      }
    })(),
  );
});

/** The two cached files that are ever returned as the answer to a navigation. */
function isDocument(url) {
  return url === SHELL_URL || url === OFFLINE_URL;
}

/**
 * Cache a document as a response a navigation can actually be answered with.
 *
 * `cache.add` follows redirects and records on the stored response that it did, and
 * `respondWith` refuses a redirected response for a navigation request — the navigation
 * fails outright and the browser shows its own error page instead of the app. Nothing in
 * this file causes that; a host with an ordinary clean-URL rule does. `npx serve`, for
 * one, answers /index.html with a 301 to /index, which is enough to make every
 * navigation in the installed app fail while an uncontrolled first load looks perfect.
 *
 * Rebuilding the response from its body drops the redirect flag, so what gets stored is
 * answerable no matter how the origin chose to route the request that produced it.
 */
async function putDocument(cache, url) {
  const response = await fetch(url, { cache: 'reload' });
  if (!response.ok) {
    throw new Error(`precache: ${url} responded ${response.status}`);
  }
  const body = await response.blob();
  await cache.put(url, new Response(body, { status: 200, statusText: response.statusText, headers: response.headers }));
}

/** True for the API surface, which is never cached — see the header comment. */
function isApiRequest(url) {
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}

/**
 * Server-rendered routes that are NOT part of the SPA. These must reach the origin even
 * as navigations, because the router has no route for them: answering from the shell
 * renders the NotFound page behind an HTTP 200 and the server never sees the request.
 *
 * `/oauth/authorize` is the case that proved this matters — the MCP consent screen is
 * server-rendered, so every creator who had ever loaded the site (which is all of them;
 * minting a key requires Studio) got a 404 page instead of a consent prompt. It looked
 * healthy to curl and in a fresh incognito window, because neither runs this worker.
 */
function isServerRenderedRoute(url) {
  return url.pathname === '/oauth' || url.pathname.startsWith('/oauth/') || url.pathname.startsWith('/.well-known/');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Non-GET, cross-origin and API traffic go to the network exactly as if this worker
  // were not installed. Returning early (rather than calling respondWith with a fetch)
  // keeps the request on the browser's own path, preserving redirects and streaming.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;
  if (isServerRenderedRoute(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }

  // Only the files this build precached. Their URLs carry Vite's content hash, so a hit
  // is exact by construction and there is nothing to revalidate.
  if (hasPrecache && BUILD.shell.includes(url.pathname)) {
    event.respondWith(precachedOrNetwork(request, url.pathname));
    return;
  }

  // A route's own lazy(() => import(...)) chunk, or something only it references (a web
  // worker build, say) — deliberately never precached, so an ordinary network fetch is
  // all this needs. Healing the shell for it would be wrong: this file failing to load
  // says nothing about whether the installed shell is intact, and RouteChunkBoundary
  // already recovers the one navigation that asked for it.
  if (BUILD.deferred.includes(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  // A page still holding a prior index.html may ask for hashes that are not in
  // this BUILD.shell. Serve them from the kept prior cache when possible; otherwise
  // heal — returning a raw 404 here is the permanent white screen.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(legacyAssetOrHeal(request, url.pathname));
  }
});

/**
 * Every navigation is answered with the precached shell, whatever the path —
 * but only when that shell can still boot. iOS Cache Storage is free to evict
 * the large hashed JS while leaving the small index.html; serving that HTML is
 * a permanent white screen. Integrity-check the JS/CSS entries before answering
 * from cache; if any are gone, fall through to the network (and drop the holey
 * cache so the next install can refill it).
 *
 * The app routes on `location.pathname` after boot, so deep links still land where they
 * should. The one thing this gives up is the server's 200-vs-404 distinction for unknown
 * paths (apps/api/src/platform/spa-paths.ts): a controlled navigation to a typo'd URL renders the
 * NotFound page with an HTTP 200 behind it. That distinction exists for crawlers and
 * tools, which never run a service worker, so the trade buys a sub-second cold start for
 * real visitors at no cost to the audience the status code was written for.
 */
async function shellIntact(cacheName) {
  const critical = BUILD.shell.filter((url) => /\.(js|css)$/.test(url));
  if (critical.length === 0) return true;
  const hits = await Promise.all(critical.map((url) => caches.match(url, { cacheName })));
  return hits.every(Boolean);
}

async function navigationResponse(request) {
  if (hasPrecache) {
    const intact = await shellIntact(CACHE);
    if (intact) {
      const shell = await caches.match(SHELL_URL, { cacheName: CACHE });
      // `redirected` is belt and braces on top of `putDocument`: answering a navigation
      // with a redirected response throws, and a throw here is a browser error page in
      // place of the whole app. Falling through to the network is always survivable;
      // this is not, so it is checked at both ends.
      if (shell && !shell.redirected) return shell;
    } else {
      // Holey shell: do not keep serving HTML that cannot boot.
      await caches.delete(CACHE);
    }
  }

  try {
    return await fetch(request);
  } catch {
    // Prefer any surviving prior shell's offline page over Response.error().
    const names = await caches.keys();
    const candidates = [CACHE, ...names.filter((name) => name.startsWith(CACHE_PREFIX))];
    for (const name of candidates) {
      const offline = await caches.match(OFFLINE_URL, { cacheName: name });
      if (offline && !offline.redirected) return offline;
    }
    return Response.error();
  }
}

async function precachedOrNetwork(request, pathname) {
  const cached = await caches.match(pathname, { cacheName: CACHE });
  if (cached) return cached;

  // Also try the kept prior revision — covers the activate race where claim
  // already flipped the controller but the page still asks for old hashes.
  const names = await caches.keys();
  const prior = names
    .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
    .sort()
    .slice(-1);
  for (const name of prior) {
    const hit = await caches.match(pathname, { cacheName: name });
    if (hit) return hit;
  }

  // Cache miss on a hashed shell file: usually a deploy race or iOS Cache Storage
  // eviction. Fetching from the network is fine when the file still exists; a 404
  // is the white-screen case (HTML without its JS). Reload clients via the SW
  // itself — postMessage is useless when the page JS never loaded.
  try {
    const response = await fetch(request);
    if (!response.ok) {
      void healBrokenShell();
    }
    return response;
  } catch (error) {
    void healBrokenShell();
    throw error;
  }
}

let healingShell = false;

async function healBrokenShell() {
  // One heal per activation window — a page asking for several missing hashes
  // must not chain navigates.
  if (healingShell) return;
  healingShell = true;
  await caches.delete(CACHE);
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    // WindowClient.navigate forces a fresh navigation without needing page JS.
    if (typeof client.navigate === 'function') {
      try {
        await client.navigate(client.url || '/');
        continue;
      } catch {
        /* fall through to postMessage for browsers without navigate */
      }
    }
    client.postMessage({ type: 'shell-asset-miss', revision: BUILD.revision });
  }
}

async function legacyAssetOrHeal(request, pathname) {
  const names = await caches.keys();
  const shellCaches = names
    .filter((name) => name.startsWith(CACHE_PREFIX))
    .sort()
    .reverse();
  for (const name of shellCaches) {
    const hit = await caches.match(pathname, { cacheName: name });
    if (hit) return hit;
  }
  try {
    const response = await fetch(request);
    if (!response.ok) {
      void healBrokenShell();
    }
    return response;
  } catch (error) {
    void healBrokenShell();
    throw error;
  }
}

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
