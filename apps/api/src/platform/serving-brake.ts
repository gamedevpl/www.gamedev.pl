import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { LoadShedControls } from './load-shedding.js';

// Bandwidth rungs of the ladder. See the launch day runbook.

// The one public route that serves many bytes.
const MEDIA_PATH = /^\/api\/games\/[^/]+\/media\/([^/?]+)/;

// The one width every published game has baked.
export const LEAN_WIDTH = 96;

// Ceiling on a lean image; a baked 96px one is ~6 KB.
const LEAN_MAX_BYTES = 32 * 1024;

export interface ServingBrakeOptions {
  controls: Pick<LoadShedControls, 'refusesVideo' | 'servesLeanMedia'>;
}

// The media file a request names, if any.
export function mediaFilename(url: string): string | null {
  return MEDIA_PATH.exec(url)?.[1] ?? null;
}

// Asking for the small variant differs from getting it.
export function isLeanEnough(location: unknown, byteLength: number): boolean {
  if (typeof location === 'string') return location.includes(`/w${LEAN_WIDTH}/`);
  return byteLength <= LEAN_MAX_BYTES;
}

function refuse(reply: FastifyReply, error: string, detail: string): string {
  const body = JSON.stringify({ error, detail });
  // sendMedia set these for a body that is no longer there.
  reply.removeHeader('location');
  reply.removeHeader('content-encoding');
  reply.removeHeader('etag');
  reply.removeHeader('accept-ranges');
  reply.removeHeader('content-range');
  reply
    .status(503)
    .header('cache-control', 'no-store')
    .header('content-length', Buffer.byteLength(body))
    .type('application/json');
  return body;
}

// A hook, not a branch: austerity is request policy.
export function registerServingBrake(app: FastifyInstance, options: ServingBrakeOptions): void {
  const { controls } = options;

  app.addHook('preHandler', async (request: FastifyRequest, reply) => {
    const filename = mediaFilename(request.url);
    if (filename === null) return;

    if (filename.endsWith('.mp4')) {
      if (!(await controls.refusesVideo())) return;
      // 503 and uncached: clearing the rung must be felt.
      return reply
        .status(503)
        .header('cache-control', 'no-store')
        .send({ error: 'video_paused', detail: 'preview video is paused to save bandwidth' });
    }

    if (!(await controls.servesLeanMedia())) return;
    // Narrowing a width the caller asked for, never widening one.
    const query = request.query as Record<string, unknown> | undefined;
    if (query) query.w = String(LEAN_WIDTH);
  });

  // The width above is a request; some lanes ignore it.
  app.addHook('onSend', async (request, reply, payload) => {
    const filename = mediaFilename(request.url);
    if (filename === null || filename.endsWith('.mp4')) return payload;
    if (reply.statusCode >= 400) return payload;
    if (!(await controls.servesLeanMedia())) return payload;

    const length = Buffer.isBuffer(payload) ? payload.length : typeof payload === 'string' ? payload.length : 0;
    if (isLeanEnough(reply.getHeader('location'), length)) return payload;
    return refuse(reply, 'media_lean', 'full-size media is paused to save bandwidth');
  });
}
