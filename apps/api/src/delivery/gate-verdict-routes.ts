import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { readBearerToken } from '../platform/bearer.js';
import type { GamesStore } from './games-store.js';
import { InvalidGateVerdictTokenError, readGateVerdictToken } from './gate-verdict-token.js';

// Manifest writes the gate used to make itself. See gate-hardening.md.
const BodySchema = z.object({
  slug: z.string().min(1),
  version: z.string().min(1),
  kind: z.enum(['gate', 'preview', 'health', 'progress']),
  result: z.record(z.unknown()),
});

export interface GateVerdictRoutesOptions {
  store: GamesStore;
  secret?: string;
  now?: () => number;
}

export const GATE_VERDICT_PATH = '/api/internal/gate-verdict';

export function registerGateVerdictRoutes(app: FastifyInstance, options: GateVerdictRoutesOptions): void {
  const secret = options.secret ?? process.env.SUBMISSION_TOKEN_SECRET?.trim();
  const now = options.now ?? Date.now;

  app.post(GATE_VERDICT_PATH, async (request, reply) => {
    // No secret, no verification: refuse rather than trust the body.
    if (!secret) return reply.status(503).send({ error: 'gate verdict endpoint is not configured' });

    const token = readBearerToken(request.headers.authorization);
    if (!token) return reply.status(401).send({ error: 'gate capability required' });

    const parsed = BodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid gate verdict' });
    const { slug, version, kind, result } = parsed.data;

    let claims;
    try {
      claims = readGateVerdictToken(token, secret, Math.floor(now() / 1000));
    } catch (error) {
      if (error instanceof InvalidGateVerdictTokenError) {
        return reply.status(401).send({ error: 'gate capability rejected' });
      }
      throw error;
    }

    // Lane is signed, not sent. See infra/gate-hardening.md.
    if (kind !== 'progress' && kind !== claims.kind) {
      request.log.warn({ allowed: claims.kind, asked: kind }, 'gate verdict lane');
      return reply.status(403).send({ error: 'gate capability does not cover this verdict' });
    }

    // A run talking about another version is what this refuses.
    if (claims.slug !== slug || claims.version !== version) {
      request.log.warn(
        { claimed: `${claims.slug}@${claims.version}`, asked: `${slug}@${version}` },
        'gate verdict scope',
      );
      return reply.status(403).send({ error: 'gate capability does not cover this version' });
    }

    switch (kind) {
      case 'gate':
        await options.store.putGateResult(slug, version, result as Parameters<GamesStore['putGateResult']>[2]);
        break;
      case 'preview':
        await options.store.putPreviewGateResult(
          slug,
          version,
          result as Parameters<GamesStore['putPreviewGateResult']>[2],
        );
        break;
      case 'health':
        await options.store.putHealthResult(slug, version, result as Parameters<GamesStore['putHealthResult']>[2]);
        break;
      case 'progress':
        await options.store.putGateProgress(
          slug,
          version,
          result as unknown as Parameters<GamesStore['putGateProgress']>[2],
        );
        break;
    }
    return reply.status(204).send();
  });
}
