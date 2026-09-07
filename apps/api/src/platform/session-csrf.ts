import type { FastifyRequest } from 'fastify';
import { canonicalAppBaseUrl } from './canonical-app-url.js';

function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

// Called only after a cookie authenticates, before any account activity write.
export function sessionWriteAllowed(request: FastifyRequest): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;

  const origin = request.headers.origin;
  const referer = request.headers.referer;
  let source: string | null;
  if (origin !== undefined) {
    source = typeof origin === 'string' ? originOf(origin) : null;
    if (!source || source !== origin) return false;
  } else if (referer !== undefined) {
    source = typeof referer === 'string' ? originOf(referer) : null;
    if (!source) return false;
  } else {
    // Headerless API clients remain supported; same-site browsers are not same-origin.
    const site = request.headers['sec-fetch-site'];
    return site === undefined || site === 'same-origin';
  }

  // Exact target origin also supports candidate revisions; never trust X-Forwarded-Host.
  const target = originOf(`${request.protocol}://${request.headers.host}`);
  const configured = (process.env.WEB_ORIGIN ?? '').split(',').map((entry) => originOf(entry.trim()));
  return source === target || source === canonicalAppBaseUrl() || configured.includes(source);
}
