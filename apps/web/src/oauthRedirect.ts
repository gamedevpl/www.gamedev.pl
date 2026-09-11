export { parseOAuthReturnParam } from './oauthReturn.js';

export function navigateToOAuthReturn(path: string, location: Pick<Location, 'origin' | 'replace'>): void {
  try {
    const oauthUrl = new URL(path, location.origin);
    if (oauthUrl.origin !== location.origin) return;
    if (oauthUrl.pathname !== '/oauth/authorize' && oauthUrl.pathname !== '/device') return;
    location.replace(`${oauthUrl.pathname}${oauthUrl.search}`);
  } catch {
    return;
  }
}
