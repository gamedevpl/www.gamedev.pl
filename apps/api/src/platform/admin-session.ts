import type { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    // False on the site's doors; admin authority needs the ops door.
    operatorDoor?: boolean;
  }
}

export function isAdmin(uid: string | undefined, adminUids: Set<string> | undefined): boolean {
  return uid !== undefined && adminUids !== undefined && adminUids.has(uid);
}

// Session only, never a PAT; on the site, ops door only.
export function isAdminSession(request: FastifyRequest, adminUids: Set<string> | undefined): boolean {
  if (request.operatorDoor === false) return false;
  return request.authMethod === 'session' && isAdmin(request.user?.uid, adminUids);
}
