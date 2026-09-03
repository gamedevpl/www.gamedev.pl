import type { FastifyInstance, FastifyRequest } from 'fastify';

// The edge overwrites this, so a forged one cannot survive.
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
}
