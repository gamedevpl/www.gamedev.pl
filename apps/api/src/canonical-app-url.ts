/**
 * Canonical public origin for absolute URLs in outbound links and OAuth metadata.
 *
 * Never derive from the request Host header — a spoofed Host must not redirect clients
 * to attacker-controlled metadata or consent URLs.
 */
const DEFAULT_ORIGIN = 'https://www.gamedev.pl';

/**
 * Reduce a configured value to a bare origin, or null when it is not a URL at all.
 *
 * Trimming trailing slashes is not enough: a `CANONICAL_HOST` or `APP_BASE_URL` carrying
 * a path, query, or fragment would be concatenated with `/.well-known/...` and yield a
 * metadata URL that resolves nowhere — and this value is handed to clients inside a
 * `WWW-Authenticate` challenge, so a misconfiguration becomes their problem, not ours.
 * `URL` also rejects outright garbage, which a regex would have passed through.
 */
function toOrigin(value: string): string | null {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

export function canonicalAppBaseUrl(): string {
  const canonicalHost = process.env.CANONICAL_HOST?.trim();
  if (canonicalHost) {
    const origin = toOrigin(canonicalHost);
    if (origin) return origin;
  }
  const appBase = process.env.APP_BASE_URL?.trim();
  if (appBase) {
    const origin = toOrigin(appBase);
    if (origin) return origin;
  }
  return DEFAULT_ORIGIN;
}
