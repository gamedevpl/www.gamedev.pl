import type { FastifyReply, FastifyRequest } from 'fastify';

// Parses an HTTP Range header against a known body size.
export function parseBytesRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return 'invalid';
  const startRaw = match[1] ?? '';
  const endRaw = match[2] ?? '';
  if (startRaw === '' && endRaw === '') return 'invalid';

  let start: number;
  let end: number;
  if (startRaw === '') {
    const suffix = Number(endRaw);
    if (!Number.isInteger(suffix) || suffix <= 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === '' ? size - 1 : Number(endRaw);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      return 'invalid';
    }
    if (start >= size) return 'invalid';
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

// Serves a cached entry with ETag and Range support.
export function sendMedia(
  request: FastifyRequest,
  reply: FastifyReply,
  entry: { etag: string; contentType: string; body: Buffer },
): FastifyReply {
  reply
    .header('ETag', entry.etag)
    .header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
    .header('Accept-Ranges', 'bytes');

  // A conditional request may carry a list, and "*" matches anything we hold.
  const ifNoneMatch = request.headers['if-none-match'];
  if (ifNoneMatch) {
    const candidates = ifNoneMatch.split(',').map((value) => value.trim().replace(/^W\//, ''));
    if (candidates.includes(entry.etag) || candidates.includes('*')) {
      return reply.status(304).send();
    }
  }

  const size = entry.body.length;
  const range = parseBytesRange(typeof request.headers.range === 'string' ? request.headers.range : undefined, size);
  if (range === 'invalid') {
    return reply.status(416).header('Content-Range', `bytes */${size}`).send();
  }
  // If-Range: only honour Range when the validator still matches this representation.
  const ifRangeRaw = request.headers['if-range'];
  const ifRange = typeof ifRangeRaw === 'string' ? ifRangeRaw.trim() : undefined;
  const rangeAllowed =
    !ifRange || ifRange === entry.etag || ifRange.replace(/^W\//, '') === entry.etag.replace(/^W\//, '');
  if (range && rangeAllowed) {
    const chunk = entry.body.subarray(range.start, range.end + 1);
    return reply
      .status(206)
      .header('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
      .header('Content-Length', String(chunk.length))
      .type(entry.contentType)
      .send(chunk);
  }

  return reply.type(entry.contentType).header('Content-Length', String(size)).send(entry.body);
}
