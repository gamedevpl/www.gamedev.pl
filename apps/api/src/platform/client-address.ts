import type { FastifyInstance, FastifyRequest } from 'fastify';
import { isUnattributable, logIpBucketRefusal, logUnattributableClient } from './client-address-metrics.js';
import { onIpRefusal } from './ip-rate-limit.js';

// Forgeable unless nothing can reach the service around the edge.
const EDGE_CLIENT_IP_HEADER = 'fastly-client-ip';

// hop===0 reproduces removed numeric trustProxy hop-count (`trustProxy: 1`).
export const trustProxyOneHop = (_address: string, hop: number): boolean => hop === 0;

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

  // The plugin stamps this header only on its own refusals.
  const refusedByPlugin = (reply: { statusCode: number; getHeader: (name: string) => unknown }) =>
    reply.statusCode === 429 && reply.getHeader('x-ratelimit-limit') !== undefined;

  // How much traffic shares the one bucket, and on which routes.
  app.addHook('onResponse', async (request, reply) => {
    if (!isUnattributable(request.clientIp)) return;
    const forwardedFor = request.headers['x-forwarded-for'];
    logUnattributableClient(request.log, {
      route: request.routeOptions?.url ?? 'unrouted',
      method: request.method,
      statusCode: reply.statusCode,
      authenticated: Boolean(request.user),
      forwardedFor: typeof forwardedFor === 'string' ? forwardedFor : null,
    });
    if (refusedByPlugin(reply)) logIpBucketRefusal(request.log, { clientIp: request.clientIp });
  });

  // Whether it refused anyone, reported only where that is provable.
  onIpRefusal((ip) => {
    if (isUnattributable(ip)) logIpBucketRefusal(app.log, { clientIp: ip });
  });
}
