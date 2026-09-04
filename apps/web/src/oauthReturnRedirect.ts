export function replaceWithOAuthReturn(oauthReturn: string): void {
  try {
    const nextUrl = new URL(oauthReturn, window.location.origin);
    const isAllowedPath = nextUrl.pathname === '/oauth/authorize' || nextUrl.pathname === '/device';
    if (nextUrl.origin !== window.location.origin || !isAllowedPath) return;
    window.location.replace(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  } catch {
    return;
  }
}
