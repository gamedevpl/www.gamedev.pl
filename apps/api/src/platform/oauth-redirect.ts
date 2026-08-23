/**
 * OAuth redirect URI matching for loopback and exact registered URIs.
 *
 * Loopback (http://127.0.0.1 and http://localhost): host + path must match; port is
 * ignored. Near-miss hosts such as 127.0.0.1.evil.test or localhost.evil.test must
 * never match.
 */

function parseRedirectUri(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === '127.0.0.1' || host === 'localhost';
}

/**
 * True when `requested` matches `registered` under OAuth redirect rules.
 */
export function redirectUriMatches(requested: string, registered: string): boolean {
  const req = parseRedirectUri(requested);
  const reg = parseRedirectUri(registered);
  if (!req || !reg) return false;
  if (req.protocol !== reg.protocol) return false;

  const reqHost = req.hostname.toLowerCase();
  const regHost = reg.hostname.toLowerCase();

  if (isLoopbackHost(reqHost) || isLoopbackHost(regHost)) {
    if (!isLoopbackHost(reqHost) || !isLoopbackHost(regHost)) return false;
    if (reqHost !== regHost) return false;
    return req.pathname === reg.pathname;
  }

  return req.origin + req.pathname + req.search + req.hash === reg.origin + reg.pathname + reg.search + reg.hash;
}

/** True when `requested` matches any entry in `allowed`. */
export function redirectUriAllowed(requested: string, allowed: readonly string[]): boolean {
  return allowed.some((registered) => redirectUriMatches(requested, registered));
}
