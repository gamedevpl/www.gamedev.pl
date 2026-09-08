import type { FastifyReply, FastifyRequest } from 'fastify';

// Hosting's one guaranteed cookie name; see docs/deployment.md before renaming.
export const SESSION_COOKIE_NAME = '__session';

// The session cookie, or undefined when the browser sent none.
export function readSessionCookie(cookies: Record<string, string | undefined>): string | undefined {
  const current = cookies[SESSION_COOKIE_NAME];
  return typeof current === 'string' && current ? current : undefined;
}

// Ends the session, and no renewal behind it.
export function clearSessionCookies(request: FastifyRequest, reply: FastifyReply): void {
  request.needsSessionRenewal = false;
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

// A handler's session cookie decides identity; renewal must not overwrite.
export function handlerWroteSessionCookie(reply: FastifyReply): boolean {
  const header = reply.getHeader('set-cookie');
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header];
  return values.some((value) => String(value).startsWith(`${SESSION_COOKIE_NAME}=`));
}
