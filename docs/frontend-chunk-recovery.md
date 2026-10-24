# Recovering missing frontend chunks

An open page can outlive the deployment that supplied its hashed JavaScript URLs.
Later imports of App or the active locale then return 404. A failed locale also
leaves i18next without its resource bundle, so the boot error must have inline
English and Polish defaults.

The [Hosting publisher](../infra/firebase/README.md#keeping-old-imports-available)
retains retired assets at their original URLs for seven days after replacement.
That prevents missing imports during the supported window. Recovery remains necessary
for older tabs, transient network failures, and assets lost before retention was enabled.

`main.tsx` registers `watchChunkRecovery` before awaiting locale initialization or
rendering React. Vite dispatches `vite:preloadError` for rejected dynamic imports;
the listener recognizes browser module-fetch and stylesheet-preload failures.
It reloads at most once per entry bundle and tab session. Offline failures,
module evaluation errors, and browsers without writable session storage retain
the manual recovery path.

Recovery probes `/` over the network, with a five-second timeout. A non-navigation
fetch to `/` bypasses the worker's shell cache; `/index.html` would be intercepted
even with `cache: 'reload'`. If the document names a different entry bundle,
it removes only `/index.html` from
the app's shell caches before reloading. Otherwise a service worker could answer
the reload with the same stale document and repeat the missing import. A transient
failure on the current build retains the cached document and retries once by
reloading. A failed document probe leaves manual recovery available.

Cached assets and unrelated caches remain available. The reload retains the
route, search parameters and fragment. Clearing a stale document temporarily
requires an online navigation until the updated worker installs its fresh shell.

This affects the first-minute arrival funnel. Existing visit and play events
still measure arrivals and successful play; automatic chunk recovery has no
dedicated event, so its frequency cannot currently be queried directly.
