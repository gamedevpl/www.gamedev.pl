import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { FastifyInstance, FastifyReply } from 'fastify';

// Generated bodies have nothing to precompute, unlike the static shell's siblings.

// The arithmetic, and why it is not close: docs/deployment.md, "Bandwidth".

// Below this, a compressed body saves less than the framing costs.
const MIN_BYTES = 1_500;

// Quality 4, not the default 11: at 11 a megabyte costs seconds.
const BROTLI_OPTIONS = { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } };

// Generated text only. PNG and MP4 are compressed already.
const COMPRESSIBLE = /^(?:application\/(?:json|javascript)|text\/|application\/[^;]*\+(?:json|xml))/i;

export type ChosenEncoding = 'br' | 'gzip' | 'identity';

// `br;q=0` refuses brotli; a substring match says yes.
export function encodingQuality(acceptEncoding: string | undefined, token: string): number {
  if (acceptEncoding === undefined) return 0;
  let wildcard: number | null = null;
  for (const part of acceptEncoding.split(',')) {
    const [name, ...params] = part.trim().split(';');
    const quality = params
      .map((param) => /^\s*q=([\d.]+)\s*$/i.exec(param))
      .find((match) => match !== null);
    const value = quality ? Number(quality[1]) : 1;
    const weight = Number.isFinite(value) ? value : 1;
    if (name?.toLowerCase() === token) return weight;
    if (name === '*') wildcard = weight;
  }
  return wildcard ?? 0;
}

// Brotli when at least as welcome as gzip.
export function chooseEncoding(acceptEncoding: string | undefined): ChosenEncoding {
  const brotli = encodingQuality(acceptEncoding, 'br');
  const gzip = encodingQuality(acceptEncoding, 'gzip');
  if (brotli > 0 && brotli >= gzip) return 'br';
  if (gzip > 0) return 'gzip';
  return 'identity';
}

// Whether a response is worth compressing, before any CPU is spent.
export function worthCompressing(contentType: unknown, byteLength: number, alreadyEncoded: boolean): boolean {
  if (alreadyEncoded) return false;
  if (byteLength < MIN_BYTES) return false;
  return typeof contentType === 'string' && COMPRESSIBLE.test(contentType);
}

function bodyOf(payload: unknown): Buffer | null {
  if (typeof payload === 'string') return Buffer.from(payload, 'utf8');
  if (Buffer.isBuffer(payload)) return payload;
  // A stream: buffering it here is the thing streaming exists to avoid.
  return null;
}

export function registerApiCompression(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply: FastifyReply, payload) => {
    if (!request.url.startsWith('/api/')) return payload;

    const body = bodyOf(payload);
    if (body === null) return payload;
    if (!worthCompressing(reply.getHeader('content-type'), body.length, reply.hasHeader('content-encoding'))) {
      return payload;
    }

    // Before the identity return too, or a cache shares it.
    reply.header('vary', 'accept-encoding');

    const accept = request.headers['accept-encoding'];
    const chosen = chooseEncoding(typeof accept === 'string' ? accept : undefined);
    if (chosen === 'identity') return payload;

    const encoded = chosen === 'br' ? brotliCompressSync(body, BROTLI_OPTIONS) : gzipSync(body, { level: 6 });
    reply.header('content-encoding', chosen);
    reply.header('content-length', encoded.length);
    return encoded;
  });
}
