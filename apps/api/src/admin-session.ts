import type { FastifyRequest } from 'fastify';

export function isAdmin(uid: string | undefined, adminUids: Set<string> | undefined): boolean {
  return uid !== undefined && adminUids !== undefined && adminUids.has(uid);
}

// Stricter than isAdmin — session only, never a personal access token.
export function isAdminSession(request: FastifyRequest, adminUids: Set<string> | undefined): boolean {
  return request.authMethod === 'session' && isAdmin(request.user?.uid, adminUids);
}
