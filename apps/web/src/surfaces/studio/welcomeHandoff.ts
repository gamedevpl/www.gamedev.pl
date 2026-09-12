import { studioPath } from '../../core/router.js';

// Play posture URL. studioPath would 404 playtest.
export function studioPlaytestPath(game: string): string {
  return `/studio/${encodeURIComponent(game)}/playtest`;
}

// Ready opens playtest; otherwise the thread.
export function welcomeHandoffHref(address: string, ready: boolean): string {
  const path = ready ? studioPlaytestPath(address) : studioPath(address);
  return `${path}?from=handoff`;
}
