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

export function prefersBrotli(acceptEncoding: string | undefined): boolean {
  return acceptEncoding !== undefined && /\bbr\b/i.test(acceptEncoding);
}

export function acceptsGzip(acceptEncoding: string | undefined): boolean {
  return acceptEncoding !== undefined && /\bgzip\b/i.test(acceptEncoding);
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

    const accept = request.headers['accept-encoding'];
    const accepted = typeof accept === 'string' ? accept : undefined;
    let encoded: Buffer;
    if (prefersBrotli(accepted)) {
      encoded = brotliCompressSync(body, BROTLI_OPTIONS);
      reply.header('content-encoding', 'br');
    } else if (acceptsGzip(accepted)) {
      encoded = gzipSync(body, { level: 6 });
      reply.header('content-encoding', 'gzip');
    } else {
      return payload;
    }

    // Else a shared cache may hand brotli to a client without it.
    reply.header('vary', 'accept-encoding');
    reply.header('content-length', encoded.length);
    return encoded;
  });
}
