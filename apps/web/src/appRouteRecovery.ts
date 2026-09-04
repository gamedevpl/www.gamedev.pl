import { Component, type ReactNode } from 'react';
import { canonicalPath, parsePathRoute, type AppRoute } from './core/router.js';

// A stale lazy chunk 404s after a deploy; only reload recovers.
export class RouteChunkBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // Advisory only — the fallback's reload prompt is the whole recovery.
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// Canonicalises the address, then reads the URL as a route.
export function readLocationRoute(): AppRoute {
  const canonical = canonicalPath(window.location.pathname);
  if (canonical) {
    window.history.replaceState(null, '', canonical);
  }
  return parsePathRoute(window.location.pathname, window.location.hash);
}
