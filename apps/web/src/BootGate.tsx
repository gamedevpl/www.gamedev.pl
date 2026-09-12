import { Component, lazy, Suspense, type ReactNode } from 'react';
import { AppLoadingScreen } from './AppLoadingScreen.js';
import { useAuth } from './AuthContext.js';
import { ClosedBetaSplash } from './ClosedBetaSplash.js';
import { appChunkReloadAllowed } from './appChunkReload.js';
import { parsePathRoute } from './core/router.js';

// App pulls in every surface; a walled visitor needs none.
const App = lazy(() => import('./App.js').then((module) => ({ default: module.App })));

// Suspense does not catch a rejected import.
class AppChunkBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    if (typeof window !== 'undefined' && appChunkReloadAllowed(window.sessionStorage)) {
      window.location.reload();
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="app app--boot-failed">
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

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
    <AppChunkBoundary>
      <Suspense fallback={<AppLoadingScreen />}>
        <App />
      </Suspense>
    </AppChunkBoundary>
  );
}
