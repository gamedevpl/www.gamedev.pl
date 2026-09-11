import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  isUnattributable,
  logEdgeHeaderUntrusted,
  logIpBucketRefusal,
  logUnattributableClient,
} from './client-address-metrics.js';
import { isGoogleOwnAddress, startEdgeRangeRefresh } from './edge-ranges.js';
import { onIpRefusal } from './ip-rate-limit.js';

// Trusted only behind a peer that is Google's own edge.
const EDGE_CLIENT_IP_HEADER = 'fastly-client-ip';

// A kill switch; the peer check is what makes it safe.
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

// No socket on an upgrade; the getter throws.
function appendedPeer(request: FastifyRequest): string {
  try {
    return request.ip;
  } catch {
    return '';
  }
}

// Cloud Run appends the peer itself, so a caller cannot choose it.
export function cameThroughEdge(request: FastifyRequest): boolean {
  return isGoogleOwnAddress(appendedPeer(request));
}

// Behind the edge the appended peer is not the caller.
export function resolveClientIp(request: FastifyRequest): string {
  const peer = appendedPeer(request);
  if (!trustsEdgeClientIp()) return peer;
  const edge = singleAddress(request.headers[EDGE_CLIENT_IP_HEADER]);
  if (!edge) return peer;
  if (isGoogleOwnAddress(peer)) return edge;
  // Forged, or a Google range the snapshot lacks.
  logEdgeHeaderUntrusted(request.log, { peer, claimed: edge.slice(0, 64) });
  return peer;
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

  // Tests never reach Google; production keeps the snapshot fresh.
  if (trustsEdgeClientIp() && process.env.NODE_ENV !== 'test') {
    const stop = startEdgeRangeRefresh(app.log);
    app.addHook('onClose', async () => stop());
  }

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
