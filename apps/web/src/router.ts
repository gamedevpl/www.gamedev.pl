export type AppRoute =
  | { view: 'home' }
  | { view: 'status'; token: string }
  // A published game being played. The slug is a stable permalink, so refreshing
  // (or sharing the URL) reopens the same game instead of dropping back to the
  // catalog. Only published games are permalinkable — generated/party stages are
  // ephemeral and stay off the route.
  | { view: 'play'; slug: string }
  // An in-progress game, addressed exactly like a published one. This is the
  // shareable form of a build: it carries no status token, so it grants watching
  // rights only — no change requests, no quota spend.
  | { view: 'draft'; slug: string }
  // A phone that scanned a lobby QR. Both the room code and its join token live
  // in the fragment, so the credential never reaches the server in a request line
  // (see docs/multiplayer-plan.md §4.3).
  | { view: 'join'; code: string; token: string }
  // The operator telemetry view. Unlisted rather than secret: reaching the route
  // renders nothing unless the API recognises the caller as an admin, and the API
  // answers 404 to everyone else.
  | { view: 'health' };

// Game slugs are lowercase kebab-case (matches the games-repo catalog); keep the
// route pattern strict so arbitrary fragments can't masquerade as a play route.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseHashRoute(hash: string): AppRoute {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;

  if (normalizedHash === '' || normalizedHash === '/') {
    return { view: 'home' };
  }

  const statusMatch = normalizedHash.match(/^\/status\/([^/]+)$/);
  if (statusMatch?.[1]) {
    return { view: 'status', token: decodeURIComponent(statusMatch[1]) };
  }

  const playMatch = normalizedHash.match(/^\/play\/([^/]+)$/);
  if (playMatch?.[1]) {
    const slug = decodeURIComponent(playMatch[1]);
    if (SLUG_PATTERN.test(slug)) {
      return { view: 'play', slug };
    }
  }

  const draftMatch = normalizedHash.match(/^\/draft\/([^/]+)$/);
  if (draftMatch?.[1]) {
    const slug = decodeURIComponent(draftMatch[1]);
    if (SLUG_PATTERN.test(slug)) {
      return { view: 'draft', slug };
    }
  }

  if (normalizedHash === '/health') {
    return { view: 'health' };
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

export function playHash(slug: string): string {
  return `#/play/${encodeURIComponent(slug)}`;
}

export function draftHash(slug: string): string {
  return `#/draft/${encodeURIComponent(slug)}`;
}
