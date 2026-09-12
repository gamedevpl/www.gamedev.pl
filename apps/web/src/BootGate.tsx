import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLoadingScreen } from './AppLoadingScreen.js';
import { RouteChunkBoundary, readLocationRoute } from './appRouteRecovery.js';
import { useAuth } from './AuthContext.js';
import { ClosedBetaSplash } from './ClosedBetaSplash.js';
import { APP_CHUNK_TIMEOUT_MS, withChunkTimeout } from './chunkTimeout.js';
import { brandedPageTitle } from './pageTitle.js';
import { useDocumentTitle } from './useDocumentTitle.js';

// App pulls in every surface; a walled visitor needs none.
const App = lazy(() =>
  withChunkTimeout(import('./App.js'), APP_CHUNK_TIMEOUT_MS).then((module) => ({ default: module.App })),
);

// App titles by route; a short-circuit must not skip that.
function Splash({ inviteCode }: { inviteCode?: string }) {
  const { t } = useTranslation();
  useDocumentTitle(inviteCode ? brandedPageTitle(t('pageTitle.invite')) : t('pageTitle.home'));
  return <ClosedBetaSplash inviteCode={inviteCode} />;
}

// Decides splash-or-app before the import, not after.
export function BootGate() {
  const { t } = useTranslation();
  const { user, loading, privateBeta } = useAuth();
  // Canonicalises first, as App does: /gamedevpl is home.
  const route = readLocationRoute();

  // The only views whose answer depends on the session.
  if (route.view === 'home' || route.view === 'invite') {
    if (loading) return <AppLoadingScreen />;
    // App splashes every signed-out visitor here, beta or not.
    if (route.view === 'invite' && !user) return <Splash inviteCode={route.code} />;
    if (route.view === 'home' && privateBeta && !user) return <Splash />;
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
