import type { FastifyInstance, FastifyRequest } from 'fastify';

// Headers a fronting proxy may set; nothing else is echoed.
const FORWARDING_HEADERS = [
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
  'fastly-client-ip',
  'cf-connecting-ip',
  'true-client-ip',
  'via',
  'forwarded',
  'origin',
  'referer',
  'host',
] as const;

function headerValue(request: FastifyRequest, name: string): string | null {
  const raw = request.headers[name];
  if (Array.isArray(raw)) return raw.join(', ');
  return typeof raw === 'string' ? raw : null;
}

export interface ProxyDiagnosticsResponse {
  // What Fastify resolved; every per-IP rate limiter buckets on this.
  resolvedIp: string;
  // Non-empty X-Forwarded-For entries, so a hop count can be chosen.
  forwardedForHops: number;
  headers: Record<string, string | null>;
}

// Padding and empty segments are legal, and would inflate the count.
function countForwardedForHops(forwardedFor: string | null): number {
  if (!forwardedFor) return 0;
  return forwardedFor.split(',').filter((entry) => entry.trim() !== '').length;
}

// Authenticated-only, so it needs no beta-wall exemption.
export function registerProxyDiagnosticsRoutes(app: FastifyInstance): void {
  app.get('/api/diagnostics/proxy', async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: 'authentication required' });

    const headers: Record<string, string | null> = {};
    for (const name of FORWARDING_HEADERS) headers[name] = headerValue(request, name);

    const response: ProxyDiagnosticsResponse = {
      resolvedIp: request.ip,
      forwardedForHops: countForwardedForHops(headers['x-forwarded-for']),
      headers,
    };
    return reply.send(response);
  });
}
