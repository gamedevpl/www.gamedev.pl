import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Firebase Hosting drops every cookie but `__session` before the request reaches Cloud
 * Run, so once Hosting fronts the service (FH-01, ops repo cdn-fronting-plan.md) any
 * other name is invisible here and every browser session stops authenticating. The name
 * is a constraint, not a style choice.
 */
export const SESSION_COOKIE_NAME = '__session';

/**
 * The pre-FH-01 name. Read, never written.
 *
 * Sessions last 30 days, so renaming outright would sign everyone out on promotion.
 * Instead a request carrying only this cookie is authenticated from it and re-minted
 * under the current name on the same response.
 *
 * Only works *before* the DNS cutover — after it the edge strips this cookie, so anyone
 * who has not visited since the rename is signed out then. That is what the soak between
 * FH-01 and FH-05 buys. Delete once the cutover is done and the last such session has
 * expired.
 */
export const LEGACY_SESSION_COOKIE_NAME = 'gamedev_session';

// The session cookie under either name, current one first.
export function readSessionCookie(cookies: Record<string, string | undefined>): {
  token: string | undefined;
  legacy: boolean;
} {
  const current = cookies[SESSION_COOKIE_NAME];
  if (typeof current === 'string' && current) return { token: current, legacy: false };
  const legacy = cookies[LEGACY_SESSION_COOKIE_NAME];
  if (typeof legacy === 'string' && legacy) return { token: legacy, legacy: true };
  return { token: undefined, legacy: false };
}

/**
 * Ends the session: clears both names and cancels any pending renewal.
 *
 * Both halves are load-bearing. The old name still authenticates through the fallback
 * above, so clearing only the current one would let the browser sign itself back in.
 * And the renewal hook runs *after* the handler, so a sign-out that leaves
 * `needsSessionRenewal` set has its cleared cookie immediately replaced by a fresh one
 * — the user stays signed in, which on a shared device is the whole failure. Renewal is
 * forced for every legacy cookie, so that is the common path during the FH-01 window,
 * not a corner case.
 */
export function clearSessionCookies(request: FastifyRequest, reply: FastifyReply): void {
  request.needsSessionRenewal = false;
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  reply.clearCookie(LEGACY_SESSION_COOKIE_NAME, { path: '/' });
}

// Drops the old cookie once a renewal has written the current one.
export function retireLegacyCookie(cookies: Record<string, string | undefined>, reply: FastifyReply): void {
  if (cookies[LEGACY_SESSION_COOKIE_NAME]) {
    reply.clearCookie(LEGACY_SESSION_COOKIE_NAME, { path: '/' });
  }
}
