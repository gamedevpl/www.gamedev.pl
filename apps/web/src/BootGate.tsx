import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLoadingScreen } from './AppLoadingScreen.js';
import { RouteChunkBoundary, readLocationRoute } from './appRouteRecovery.js';
import { useAuth } from './AuthContext.js';
import { ClosedBetaSplash } from './ClosedBetaSplash.js';
import { APP_CHUNK_TIMEOUT_MS, withChunkTimeout } from './chunkTimeout.js';

// App pulls in every surface; a walled visitor needs none.
const App = lazy(() =>
  withChunkTimeout(import('./App.js'), APP_CHUNK_TIMEOUT_MS).then((module) => ({ default: module.App })),
);

// Only these two can end in the splash.
function needsSession(view: string): boolean {
  return view === 'home' || view === 'invite';
}

// Decides splash-or-app before the import, not after.
export function BootGate() {
  const { t } = useTranslation();
  const { user, loading, privateBeta } = useAuth();
  // Canonicalises first, as App does: /gamedevpl is home.
  const [route, setRoute] = useState(readLocationRoute);
  useEffect(() => {
    const update = () => setRoute(readLocationRoute());
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    update();
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('popstate', update);
    };
  }, []);

  if (needsSession(route.view)) {
    if (loading) return <AppLoadingScreen />;
    if (privateBeta && !user) {
      if (route.view === 'home') return <ClosedBetaSplash />;
      if (route.view === 'invite') return <ClosedBetaSplash inviteCode={route.code} />;
    }
  }

  return (
    <RouteChunkBoundary
      fallback={
        <div className="content-load-error">
          <p>{t('app.surfaceLoadFailed')}</p>
          <button type="button" className="secondary-btn" onClick={() => window.location.reload()}>
            {t('app.reload')}
          </button>
        </div>
      }
    >
      <Suspense fallback={<AppLoadingScreen />}>
        <App />
      </Suspense>
    </RouteChunkBoundary>
  );
}
