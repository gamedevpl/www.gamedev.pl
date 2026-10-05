import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { readBearerToken } from '../platform/bearer.js';
import type { GcsObjectStore } from './gcs-sign.js';
import { gcsUploadHeaders } from './gcs-v4-sign.js';
import { InvalidGateVerdictTokenError, readGateVerdictToken, type GateVerdictKind } from './gate-verdict-token.js';

// Per-object upload URLs for gate artifacts. See infra/gate-hardening.md.
export const GATE_ARTIFACT_URL_PATH = '/api/internal/gate-artifact-url';

// Minted just before each PUT; covers a slow capture video.
export const GATE_ARTIFACT_URL_TTL_SECONDS = 10 * 60;

const BodySchema = z.object({
  slug: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1).max(200),
});

const MEDIA_NAME = /^media\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(png|mp4|json)$/;

// Mirrors gate-runner.ts per lane. Null means refused.
export function gateArtifactContentType(kind: GateVerdictKind, name: string): string | null {
  if (kind === 'health') return null;
  if (name === 'preview.html') return 'text/html; charset=utf-8';
  const media = MEDIA_NAME.exec(name);
  if (media) {
    return media[1] === 'png' ? 'image/png' : media[1] === 'mp4' ? 'video/mp4' : 'application/json';
  }
  if (kind !== 'gate') return null;
  if (name === 'bundle.html') return 'text/html; charset=utf-8';
  if (name === 'source/TRACE.json') return 'text/plain; charset=utf-8';
  return null;
}

export interface GateArtifactRoutesOptions {
  objectStore: GcsObjectStore;
  secret?: string;
  now?: () => number;
}

export function registerGateArtifactRoutes(app: FastifyInstance, options: GateArtifactRoutesOptions): void {
  const secret = options.secret ?? process.env.SUBMISSION_TOKEN_SECRET?.trim();
  const now = options.now ?? Date.now;

  app.post(GATE_ARTIFACT_URL_PATH, async (request, reply) => {
    if (!secret || !options.objectStore.signUploadUrl) {
      return reply.status(503).send({ error: 'gate artifact uploads are not configured' });
    }

    const token = readBearerToken(request.headers.authorization);
    if (!token) return reply.status(401).send({ error: 'gate capability required' });

    const parsed = BodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid gate artifact request' });
    const { slug, version, name } = parsed.data;

    let claims;
    try {
      claims = readGateVerdictToken(token, secret, Math.floor(now() / 1000));
    } catch (error) {
      if (error instanceof InvalidGateVerdictTokenError) {
        return reply.status(401).send({ error: 'gate capability rejected' });
      }
      throw error;
    }

    if (claims.slug !== slug || claims.version !== version) {
      request.log.warn(
        { claimed: `${claims.slug}@${claims.version}`, asked: `${slug}@${version}` },
        'gate artifact scope',
      );
      return reply.status(403).send({ error: 'gate capability does not cover this version' });
    }

    const contentType = gateArtifactContentType(claims.kind, name);
    if (!contentType) {
      request.log.warn({ lane: claims.kind, name }, 'gate artifact name');
      return reply.status(403).send({ error: 'gate capability does not cover this artifact' });
    }

    // From the signed claims, never the body's strings.
    const object = `games/${claims.slug}/versions/${claims.version}/${name}`;
    const url = await options.objectStore.signUploadUrl(object, contentType, GATE_ARTIFACT_URL_TTL_SECONDS);
    return reply.send({ url, headers: gcsUploadHeaders(contentType) });
  });
}
