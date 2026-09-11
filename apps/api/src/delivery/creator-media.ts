import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isRateLimited } from '../platform/ip-rate-limit.js';
import { sendMedia } from '../platform/media-response.js';
import type { BuildMediaStore } from '../platform/store.js';
import { InvalidTokenError, verifyToken } from '../platform/submission-token.js';

export interface CreatorMediaRoutesOptions {
  store?: BuildMediaStore;
  now: () => number;
  submissionTokenSecret?: string;
  checkUserAccess: (request: FastifyRequest, reply: FastifyReply) => boolean;
  mediaByIp: Map<string, number[]>;
  maxMediaPerWindow: number;
  mediaRateLimitWindowMs: number;
}

// Serves a creator's own stored screenshots and previews back by id.
export async function registerCreatorMediaRoutes(
  app: FastifyInstance,
  options: CreatorMediaRoutesOptions,
): Promise<void> {
  const { store, now, submissionTokenSecret, checkUserAccess, mediaByIp, maxMediaPerWindow, mediaRateLimitWindowMs } =
    options;

  app.get(
    '/api/submissions/:token/shot/:id',
    { config: { rateLimit: { max: maxMediaPerWindow, timeWindow: mediaRateLimitWindowMs } } },
    async (request, reply) => {
      if (!submissionTokenSecret || !store) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }
      if (!checkUserAccess(request, reply)) {
        return;
      }

      const parsedParams = z.object({ token: z.string(), id: z.string().max(64) }).safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(404).send({ error: 'media not found' });
      }

      const currentTime = now();
      if (isRateLimited(mediaByIp, request.clientIp, currentTime, maxMediaPerWindow, mediaRateLimitWindowMs)) {
        return reply.status(429).send({ error: 'too many game requests, please try again later' });
      }

      let jobId: number;
      try {
        jobId = verifyToken(parsedParams.data.token, submissionTokenSecret);
      } catch (error) {
        if (error instanceof InvalidTokenError) {
          return reply.status(400).send({ error: 'invalid submission token' });
        }
        throw error;
      }

      try {
        const shot = await store.getBuildShot(jobId, parsedParams.data.id);
        if (!shot) {
          return reply.status(404).send({ error: 'media not found' });
        }

        const body = Buffer.from(shot.data, 'base64');
        return sendMedia(request, reply, {
          // Immutable once stored, so the id alone is a sound ETag.
          etag: `"${shot.id}"`,
          contentType: 'image/png',
          body,
        });
      } catch (error) {
        request.log.error({ err: error }, 'failed to serve build screenshot');
        return reply.status(502).send({ error: 'failed to load game media' });
      }
    },
  );

  // Serves unreviewed agent HTML — the most dangerous response in this file.

  // No allow-same-origin: opaque origin, no storage or cookie access.

  // default-src none, inline only: nothing embedded can call home.

  // No frame-ancestors: the web app may live on a different origin.

  // Short private cache: a preview is superseded within minutes.
  app.get(
    '/api/submissions/:token/preview/:id',
    { config: { rateLimit: { max: maxMediaPerWindow, timeWindow: mediaRateLimitWindowMs } } },
    async (request, reply) => {
      if (!submissionTokenSecret || !store) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }
      if (!checkUserAccess(request, reply)) {
        return;
      }

      const parsedParams = z.object({ token: z.string(), id: z.string().max(64) }).safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(404).send({ error: 'preview not found' });
      }

      const currentTime = now();
      if (isRateLimited(mediaByIp, request.clientIp, currentTime, maxMediaPerWindow, mediaRateLimitWindowMs)) {
        return reply.status(429).send({ error: 'too many game requests, please try again later' });
      }

      let jobId: number;
      try {
        jobId = verifyToken(parsedParams.data.token, submissionTokenSecret);
      } catch (error) {
        if (error instanceof InvalidTokenError) {
          return reply.status(400).send({ error: 'invalid submission token' });
        }
        throw error;
      }

      try {
        const preview = await store.getBuildPreview(jobId, parsedParams.data.id);
        if (!preview) {
          return reply.status(404).send({ error: 'preview not found' });
        }

        return reply
          .header(
            'Content-Security-Policy',
            "sandbox allow-scripts allow-pointer-lock; default-src 'none'; script-src 'unsafe-inline'; " +
              "style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; " +
              "connect-src 'none'; form-action 'none'; base-uri 'none'",
          )
          .header('X-Content-Type-Options', 'nosniff')
          .header('Content-Disposition', 'inline')
          .header('Cache-Control', 'private, max-age=60')
          .type('text/html; charset=utf-8')
          .send(Buffer.from(preview.data, 'base64'));
      } catch (error) {
        request.log.error({ err: error }, 'failed to serve build preview');
        return reply.status(502).send({ error: 'failed to load preview' });
      }
    },
  );
}
