import type { FastifyReply, FastifyRequest } from 'fastify';

// Firebase Hosting forwards only this name; see docs/deployment.md before renaming.
export const SESSION_COOKIE_NAME = '__session';

// Pre-rename name: read, never written. Retire per docs/deployment.md.
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

// Ends the session: both names, and no renewal behind it.
export function clearSessionCookies(request: FastifyRequest, reply: FastifyReply): void {
  request.needsSessionRenewal = false;
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  reply.clearCookie(LEGACY_SESSION_COOKIE_NAME, { path: '/' });
}

// A handler's session cookie decides identity; renewal must not overwrite.
export function handlerWroteSessionCookie(reply: FastifyReply): boolean {
  return wroteCookieNamed(reply, SESSION_COOKIE_NAME);
}

// Set-Cookie is one value or many; this flattens both shapes.
function wroteCookieNamed(reply: FastifyReply, name: string): boolean {
  const header = reply.getHeader('set-cookie');
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header];
  return values.some((value) => String(value).startsWith(`${name}=`));
}

// Left standing, the old name outlives the session that replaced it. Idempotent.
export function retireLegacyCookie(cookies: Record<string, string | undefined>, reply: FastifyReply): void {
  if (!cookies[LEGACY_SESSION_COOKIE_NAME]) return;
  if (wroteCookieNamed(reply, LEGACY_SESSION_COOKIE_NAME)) return;
  reply.clearCookie(LEGACY_SESSION_COOKIE_NAME, { path: '/' });
}
