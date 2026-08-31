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
 * The old name still authenticates through the fallback above, so clearing only the
 * current one would let the browser sign itself back in.
 *
 * Cancelling renewal says plainly that this response ends the session, and saves
 * minting a token nobody should receive. `handlerWroteSessionCookie` below is the
 * general backstop for the same hazard; sign-out states it outright rather than relying
 * on it.
 */
export function clearSessionCookies(request: FastifyRequest, reply: FastifyReply): void {
  request.needsSessionRenewal = false;
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  reply.clearCookie(LEGACY_SESSION_COOKIE_NAME, { path: '/' });
}

/**
 * Drops the old cookie on any response that writes the session anew.
 *
 * It must go with *whichever* half wrote the replacement, handler or renewal. Left
 * standing it is a 30-day credential sitting behind a session that may be far shorter:
 * once the new cookie expires the fallback finds the old one and silently restores the
 * identity it belonged to — which, after a sign-in as somebody else, is the wrong
 * person. Idempotent, so a response that already cleared it stays as it is.
 */
export function retireLegacyCookie(cookies: Record<string, string | undefined>, reply: FastifyReply): void {
  if (!cookies[LEGACY_SESSION_COOKIE_NAME]) return;
  if (wroteCookieNamed(reply, LEGACY_SESSION_COOKIE_NAME)) return;
  reply.clearCookie(LEGACY_SESSION_COOKIE_NAME, { path: '/' });
}

/**
 * Whether a handler already wrote the session cookie on this response.
 *
 * A handler that set it has decided who this browser is — signed in as someone else,
 * or signed out. The renewal hook runs afterwards and would append a second cookie for
 * the *previous* identity; for the same name and path the later one wins, so the
 * response says one thing and the next request authenticates as another. Renewal must
 * never overwrite that decision.
 */
export function handlerWroteSessionCookie(reply: FastifyReply): boolean {
  return wroteCookieNamed(reply, SESSION_COOKIE_NAME);
}

// Set-Cookie is one value or many; this flattens both shapes.
function wroteCookieNamed(reply: FastifyReply, name: string): boolean {
  const header = reply.getHeader('set-cookie');
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header];
  return values.some((value) => String(value).startsWith(`${name}=`));
}
