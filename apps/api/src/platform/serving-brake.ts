import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { LoadShedControls } from './load-shedding.js';

// Bandwidth rungs of the ladder. See the launch day runbook.

// The one public route that serves many bytes.
const MEDIA_PATH = /^\/api\/games\/[^/]+\/media\/([^/?]+)/;

// The one width every published game has baked.
const LEAN_WIDTH = '96';

export interface ServingBrakeOptions {
  controls: Pick<LoadShedControls, 'refusesVideo' | 'servesLeanMedia'>;
}

// The media file a request names, if any.
export function mediaFilename(url: string): string | null {
  return MEDIA_PATH.exec(url)?.[1] ?? null;
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
    if (query) query.w = LEAN_WIDTH;
  });
}
