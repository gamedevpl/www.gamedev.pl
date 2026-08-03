/**
 * Resume path after Google/Apple sign-in when `/oauth/authorize` bounced an
 * unauthenticated browser to `/studio?oauth_return=…`.
 *
 * Only same-origin relative `/oauth/authorize` paths are accepted — anything else
 * would be an open redirect into a phishing page after login.
 */

export function parseOAuthReturnParam(search: string): string | null {
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('oauth_return');
  if (!raw) return null;
  return sanitizeOAuthReturnPath(raw);
}

/** True when `path` is a relative authorize URL we may navigate to after login. */
export function sanitizeOAuthReturnPath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith('/oauth/authorize')) return null;
  // Reject scheme-relative (`//evil`), encoded tricks, and backslashes.
  if (trimmed.startsWith('//') || trimmed.includes('\\') || /[\r\n]/.test(trimmed)) return null;
  if (trimmed.includes('://')) return null;
  // Allow bare authorize or authorize with a query string only.
  if (trimmed !== '/oauth/authorize' && !trimmed.startsWith('/oauth/authorize?')) return null;
  return trimmed;
}
