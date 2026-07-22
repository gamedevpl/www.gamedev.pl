export type AppRoute = { view: 'home' } | { view: 'status'; token: string };

export function parseHashRoute(hash: string): AppRoute {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;

  if (normalizedHash === '' || normalizedHash === '/') {
    return { view: 'home' };
  }

  const statusMatch = normalizedHash.match(/^\/status\/([^/]+)$/);
  if (statusMatch?.[1]) {
    return { view: 'status', token: decodeURIComponent(statusMatch[1]) };
  }

  return { view: 'home' };
}

export function statusHash(token: string): string {
  return `#/status/${encodeURIComponent(token)}`;
}
