export type AppRoute =
  | { view: 'home' }
  | { view: 'status'; token: string }
  // A phone that scanned a lobby QR. Both the room code and its join token live
  // in the fragment, so the credential never reaches the server in a request line
  // (see docs/multiplayer-plan.md §4.3).
  | { view: 'join'; code: string; token: string };

export function parseHashRoute(hash: string): AppRoute {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;

  if (normalizedHash === '' || normalizedHash === '/') {
    return { view: 'home' };
  }

  const statusMatch = normalizedHash.match(/^\/status\/([^/]+)$/);
  if (statusMatch?.[1]) {
    return { view: 'status', token: decodeURIComponent(statusMatch[1]) };
  }

  const joinMatch = normalizedHash.match(/^\/join\/([A-Z0-9]{6})\/([A-Za-z0-9_-]+)$/);
  if (joinMatch?.[1] && joinMatch[2]) {
    return { view: 'join', code: joinMatch[1], token: joinMatch[2] };
  }

  return { view: 'home' };
}

export function statusHash(token: string): string {
  return `#/status/${encodeURIComponent(token)}`;
}
