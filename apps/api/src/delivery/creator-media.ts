import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MAX_SHOT_BYTES } from '@gamedevpl/contract';
import type { ChatAgentImage } from '../creation/chat-agent.js';
import { PLAYTEST_CONTEXT_HEADER } from './build-transcript.js';
import { isRateLimited } from '../platform/ip-rate-limit.js';
import { sendMedia } from '../platform/media-response.js';
import type { BuildMediaStore } from '../platform/store.js';
import { InvalidTokenError, verifyToken } from '../platform/submission-token.js';

export const MAX_REFERENCE_IMAGES = 4;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_CREATOR_SHOT_BYTES = MAX_SHOT_BYTES;

// Same shape as FeedbackRequestSchema's `context` — kept structurally in sync by hand.
export interface PlaytestFeedbackContext {
  screenshotPng?: string;
  instrumentation?: {
    playSeconds?: number;
    lastAliveFrames?: number | null;
    errors?: string[];
    progress?: string[];
  };
  referenceImages?: string[];
}

// Fenced playtest context block, plus a stored screenshot id for agent fetch.
export function formatPlaytestContextBlock(
  context: PlaytestFeedbackContext | undefined,
  shotId?: string,
  referenceImageShotIds?: string[],
): string | null {
  if (!context) return null;
  const lines: string[] = [];
  const instrumentation = context.instrumentation;
  if (instrumentation) {
    if (typeof instrumentation.playSeconds === 'number') {
      lines.push(`playSeconds: ${instrumentation.playSeconds}`);
    }
    if (instrumentation.lastAliveFrames != null) {
      lines.push(`lastAliveFrames: ${instrumentation.lastAliveFrames}`);
    }
    if (instrumentation.errors?.length) {
      lines.push('errors:');
      for (const error of instrumentation.errors) lines.push(`- ${error}`);
    }
    if (instrumentation.progress?.length) {
      lines.push('progress:');
      for (const label of instrumentation.progress) lines.push(`- ${label}`);
    }
  }
  if (shotId) {
    lines.push(`screenshotShotId: ${shotId}`);
  } else if (context.screenshotPng) {
    lines.push('screenshot: (capture failed validation — text context only)');
  }
  if (referenceImageShotIds && referenceImageShotIds.length > 0) {
    lines.push(`referenceImageShotIds: ${referenceImageShotIds.join(', ')}`);
  } else if (context.referenceImages && context.referenceImages.length > 0) {
    lines.push('referenceImages: (capture failed validation — text context only)');
  }
  if (lines.length === 0) return null;
  return [PLAYTEST_CONTEXT_HEADER, '```text', ...lines, '```'].join('\n');
}

// Validates and persists a base64 PNG as a build shot.
async function storeCreatorImage(
  store: BuildMediaStore,
  jobId: number,
  pngBase64: string | undefined,
  label: 'creator-playtest' | 'creator-reference',
): Promise<string | undefined> {
  if (!pngBase64) return undefined;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(pngBase64, 'base64');
  } catch {
    return undefined;
  }
  if (bytes.length === 0 || bytes.length > MAX_CREATOR_SHOT_BYTES) return undefined;
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return undefined;
  const stored = await store.appendBuildShot(jobId, {
    data: bytes.toString('base64'),
    label,
  });
  return stored.id;
}

export async function storeCreatorPlaytestShot(
  store: BuildMediaStore,
  jobId: number,
  pngBase64: string | undefined,
): Promise<string | undefined> {
  return storeCreatorImage(store, jobId, pngBase64, 'creator-playtest');
}

// Persists up to MAX_REFERENCE_IMAGES images; also returns validated bytes for chat.
export async function storeCreatorReferenceImages(
  store: BuildMediaStore,
  jobId: number,
  pngBase64List: string[] | undefined,
): Promise<{ ids: string[]; images: ChatAgentImage[] }> {
  if (!pngBase64List || pngBase64List.length === 0) return { ids: [], images: [] };
  const ids: string[] = [];
  const images: ChatAgentImage[] = [];
  for (const png of pngBase64List.slice(0, MAX_REFERENCE_IMAGES)) {
    const id = await storeCreatorImage(store, jobId, png, 'creator-reference');
    if (id) {
      ids.push(id);
      images.push({ data: png, mediaType: 'image/png' });
    }
  }
  return { ids, images };
}

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
