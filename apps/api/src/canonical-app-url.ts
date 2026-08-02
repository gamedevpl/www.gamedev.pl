/**
 * Canonical public origin for absolute URLs in outbound links and OAuth metadata.
 *
 * Never derive from the request Host header — a spoofed Host must not redirect clients
 * to attacker-controlled metadata or consent URLs.
 */
export function canonicalAppBaseUrl(): string {
  const canonicalHost = process.env.CANONICAL_HOST?.trim();
  if (canonicalHost) {
    return `https://${canonicalHost.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  }
  const appBase = process.env.APP_BASE_URL?.trim();
  if (appBase) {
    return appBase.replace(/\/+$/, '');
  }
  return 'https://www.gamedev.pl';
}
