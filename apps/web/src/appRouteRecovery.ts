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
    // Keep search and hash; framed-play UTM lives in search.
    window.history.replaceState(null, '', `${canonical}${window.location.search}${window.location.hash}`);
  }
  return parsePathRoute(window.location.pathname, window.location.hash);
}
