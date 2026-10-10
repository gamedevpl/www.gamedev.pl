import { redirectUriAllowed } from './oauth-redirect.js';

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
// Desktop agents that register a bare app scheme instead of reverse-DNS.
const AGENT_APP_SCHEMES = new Set(['cursor:', 'vscode:', 'vscode-insiders:', 'windsurf:']);

// CIMD: https, or http on loopback only.
export function validCimdRedirect(uri: string): boolean {
  const url = new URL(uri);
  const loopback = LOOPBACK_HOSTS.includes(url.hostname.toLowerCase());
  return (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) && redirectUriAllowed(uri, [uri]);
}

// DCR: https, loopback http, or a private-use app scheme (RFC 8252).
export function validDcrRedirect(uri: string): boolean {
  if (uri.includes('#')) return false;
  const url = new URL(uri);
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') return LOOPBACK_HOSTS.includes(url.hostname.toLowerCase());
  return url.protocol.includes('.') || AGENT_APP_SCHEMES.has(url.protocol);
}
