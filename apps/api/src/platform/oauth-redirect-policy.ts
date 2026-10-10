import { redirectUriAllowed } from './oauth-redirect.js';

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
// Schemes a browser would run or read locally; never a redirect target.
const BLOCKED_REDIRECT_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:']);

// CIMD: https, or http on loopback only.
export function validCimdRedirect(uri: string): boolean {
  const url = new URL(uri);
  const loopback = LOOPBACK_HOSTS.includes(url.hostname.toLowerCase());
  return (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) && redirectUriAllowed(uri, [uri]);
}

// DCR: also private-use schemes like cursor:// (RFC 8252).
export function validDcrRedirect(uri: string): boolean {
  const url = new URL(uri);
  if (BLOCKED_REDIRECT_SCHEMES.has(url.protocol) || url.hash) return false;
  if (url.protocol === 'http:') return LOOPBACK_HOSTS.includes(url.hostname.toLowerCase());
  return true;
}
