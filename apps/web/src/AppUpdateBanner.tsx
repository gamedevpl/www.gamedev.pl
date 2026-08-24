/**
 * "A new version is ready" — the visible half of the shell cache's honesty contract.
 *
 * Precaching the shell buys the sub-second cold start M1 is measured on, and costs the
 * guarantee that what you are looking at is what was deployed: a returning visitor is
 * served the build they last cached, and only the *next* navigation picks up a newer one.
 * Left there, that is the silent staleness the service worker's own header comment warns
 * about at length.
 *
 * So the worker announces itself when it replaces a previous build (`shell-updated`), and
 * this offers the one action that resolves it. A stale shell now lasts exactly as long as
 * someone ignores a banner, which is a different and much more defensible thing than
 * lasting until they happen to navigate.
 *
 * The announce can beat this component to the punch (auth splash, beta gate). Boot-time
 * {@link watchShellUpdates} parks it in sessionStorage so a late mount still sees it.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { clearPendingShellUpdate, pendingShellUpdate, SHELL_UPDATED_EVENT } from './shellUpdate.js';

export function AppUpdateBanner() {
  const { t } = useTranslation();
  const [updated, setUpdated] = useState(() => pendingShellUpdate() != null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let serviceWorker: ServiceWorkerContainer;
    try {
      serviceWorker = navigator.serviceWorker;
    } catch {
      // A sandboxed context throws on access; treat it as unsupported.
      return;
    }

    function show() {
      setUpdated(true);
    }

    function onMessage(event: MessageEvent) {
      if ((event.data as { type?: string } | null)?.type === 'shell-updated') {
        show();
      }
    }

    function onParked() {
      if (pendingShellUpdate()) show();
    }

    serviceWorker.addEventListener('message', onMessage);
    window.addEventListener(SHELL_UPDATED_EVENT, onParked);
    // Re-read in case the early listener won the race between first render and effect.
    onParked();

    return () => {
      serviceWorker.removeEventListener('message', onMessage);
      window.removeEventListener(SHELL_UPDATED_EVENT, onParked);
    };
  }, []);

  if (!updated) return null;

  return (
    <aside className="app-update" role="status" aria-live="polite">
      <PixelIcon name="bolt" size={16} className="app-update__icon" />
      <p className="app-update__text">{t('pwa.updateTitle')}</p>
      <div className="app-update__actions">
        {/* A plain reload is enough: the new worker has already claimed this page, so the
            very next document request is answered from the new build's cache. */}
        <button
          type="button"
          className="primary-btn app-update__reload"
          onClick={() => {
            clearPendingShellUpdate();
            window.location.reload();
          }}
        >
          {t('pwa.updateAction')}
        </button>
        <button
          type="button"
          className="app-update__close"
          onClick={() => {
            clearPendingShellUpdate();
            setUpdated(false);
          }}
          aria-label={t('pwa.updateDismiss')}
          title={t('pwa.updateDismiss')}
        >
          <PixelIcon name="close" size={12} />
        </button>
      </div>
    </aside>
  );
}
