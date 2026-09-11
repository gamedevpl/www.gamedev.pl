/**
 * Resume path after Google/Apple sign-in when OAuth bounced an
 * unauthenticated browser to `/studio?oauth_return=…`.
 *
 * Only same-origin relative authorize and device paths are accepted.
 */

export function parseOAuthReturnParam(search: string): string | null {
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('oauth_return');
  if (!raw) return null;
  return sanitizeOAuthReturnPath(raw);
}

/** True when `path` is a relative OAuth URL we may navigate to after login. */
export function sanitizeOAuthReturnPath(path: string): string | null {
  const trimmed = path.trim();
  if (trimmed.startsWith('//') || trimmed.includes('\\') || /[\r\n]/.test(trimmed) || trimmed.includes('://')) {
    return null;
  }
  if (trimmed === '/oauth/authorize' || trimmed.startsWith('/oauth/authorize?')) return trimmed;
  if (trimmed === '/device' || trimmed.startsWith('/device?')) return trimmed;
  return null;
}
