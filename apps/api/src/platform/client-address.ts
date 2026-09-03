import type { FastifyInstance, FastifyRequest } from 'fastify';
import { isUnattributable, logUnattributableClient } from './client-address-metrics.js';

// Forgeable unless nothing can reach the service around the edge.
const EDGE_CLIENT_IP_HEADER = 'fastly-client-ip';

// Only where nothing can reach the service directly.
export function trustsEdgeClientIp(): boolean {
  return process.env.TRUST_EDGE_CLIENT_IP?.trim() === 'true';
}

// A list means an untrusted hop wrote it.
function singleAddress(raw: string | string[] | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value === '' || value.includes(',')) return null;
  return value;
}

// Behind the edge this is not the caller.
export function resolveClientIp(request: FastifyRequest): string {
  const edge = trustsEdgeClientIp() ? singleAddress(request.headers[EDGE_CLIENT_IP_HEADER]) : null;
  if (edge) return edge;
  // No socket on an upgrade; the getter throws.
  try {
    return request.ip;
  } catch {
    return '';
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    // What limiters bucket on; differs from request.ip behind a CDN.
    clientIp: string;
  }
}

export function registerClientAddress(app: FastifyInstance): void {
  app.decorateRequest('clientIp', '');
  app.addHook('onRequest', async (request) => {
    request.clientIp = resolveClientIp(request);
  });

  // These callers share one bucket, so record whether that refused anyone.
  app.addHook('onResponse', async (request, reply) => {
    if (!isUnattributable(request.clientIp)) return;
    const forwardedFor = request.headers['x-forwarded-for'];
    logUnattributableClient(request.log, {
      route: request.routeOptions?.url ?? 'unrouted',
      method: request.method,
      statusCode: reply.statusCode,
      rateLimited: reply.statusCode === 429,
      authenticated: Boolean(request.user),
      forwardedFor: typeof forwardedFor === 'string' ? forwardedFor : null,
    });
  });
}
