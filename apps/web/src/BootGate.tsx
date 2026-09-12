import { lazy, Suspense } from 'react';
import { AppLoadingScreen } from './AppLoadingScreen.js';
import { useAuth } from './AuthContext.js';
import { ClosedBetaSplash } from './ClosedBetaSplash.js';
import { parsePathRoute } from './core/router.js';

// App pulls in every surface; a walled visitor needs none.
const App = lazy(() => import('./App.js').then((module) => ({ default: module.App })));

// Decides splash-or-app before the import, not after.
export function BootGate() {
  const { user, loading, privateBeta } = useAuth();
  if (loading) return <AppLoadingScreen />;

  if (privateBeta && !user) {
    const route = parsePathRoute(window.location.pathname, window.location.hash);
    // Only these two: App answers both with the splash.
    if (route.view === 'home') return <ClosedBetaSplash />;
    if (route.view === 'invite') return <ClosedBetaSplash inviteCode={route.code} />;
  }

  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <App />
    </Suspense>
  );
}
