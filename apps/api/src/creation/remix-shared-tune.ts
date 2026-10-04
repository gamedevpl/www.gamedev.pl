import type { RemixMode } from '@gamedevpl/contract';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { EditorDefinition } from './editor-contract.js';
import { MAX_SHARE_CODE_LENGTH, readShareCode, sharedTexts, validateSharedParams } from './remix-share.js';
import { replyModerationBlock, type ContentChecker } from '../platform/moderation.js';
import { logModerationRejection } from '../platform/moderation-metrics.js';

const ParamsSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
});
const QuerySchema = z.object({ code: z.string().min(1).max(MAX_SHARE_CODE_LENGTH) });

export interface SharedTuneRouteOptions {
  secret?: string;
  contentChecker?: ContentChecker;
  remixMode: (slug: string) => Promise<RemixMode>;
  // The game's current declaration, or null when it is not remixable.
  loadDeclaration: (slug: string) => Promise<{ definition: EditorDefinition; sources: Record<string, string> } | null>;
}

// Public read: a recipient turns a signed share code into validated params.
export function registerSharedTuneRoute(app: FastifyInstance, options: SharedTuneRouteOptions): void {
  app.get(
    '/api/games/:slug/shared-tune',
    { config: { rateLimit: { max: 30, timeWindow: 60_000 } } },
    async (request, reply) => {
      const params = ParamsSchema.safeParse(request.params);
      const query = QuerySchema.safeParse(request.query);
      if (!params.success || !query.success || !options.secret) {
        return reply.status(400).send({ error: 'invalid_share' });
      }
      const slug = params.data.slug;
      const claimed = readShareCode(query.data.code, slug, options.secret);
      if (!claimed) return reply.status(400).send({ error: 'invalid_share' });
      if ((await options.remixMode(slug)) === 'off') return reply.status(403).send({ error: 'remix_off' });

      const declared = await options.loadDeclaration(slug);
      if (!declared?.definition.params) return reply.status(400).send({ error: 'invalid_share' });
      const values = validateSharedParams(declared.definition, declared.sources, claimed);

      // Re-moderated on arrival; the checker may have learned since minting.
      const texts = sharedTexts(declared.definition, values);
      if (texts.length > 0 && options.contentChecker) {
        const verdict = await options.contentChecker.checkFields(texts);
        if (!verdict.allowed) {
          logModerationRejection(request.log, {
            surface: 'remix_share',
            uid: request.user?.uid,
            category: verdict.category,
            unavailable: verdict.unavailable,
          });
          // Checker outage is ours; a refusal reads as a bad link.
          if (verdict.unavailable) return replyModerationBlock(reply, verdict);
          return reply.status(400).send({ error: 'invalid_share' });
        }
      }
      return reply.send({ params: values });
    },
  );
}
