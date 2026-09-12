import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLoadingScreen } from './AppLoadingScreen.js';
import { RouteChunkBoundary, readLocationRoute } from './appRouteRecovery.js';
import { useAuth } from './AuthContext.js';
import { ClosedBetaSplash } from './ClosedBetaSplash.js';

// App pulls in every surface; a walled visitor needs none.
const App = lazy(() => import('./App.js').then((module) => ({ default: module.App })));

// Decides splash-or-app before the import, not after.
export function BootGate() {
  const { t } = useTranslation();
  const { user, loading, privateBeta } = useAuth();
  if (loading) return <AppLoadingScreen />;

  if (privateBeta && !user) {
    // Canonicalises the address first, as App does: /gamedevpl is home.
    const route = readLocationRoute();
    // Only these two: App answers both with the splash.
    if (route.view === 'home') return <ClosedBetaSplash />;
    if (route.view === 'invite') return <ClosedBetaSplash inviteCode={route.code} />;
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
