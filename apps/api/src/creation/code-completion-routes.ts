import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isDeliverablePath, isRasterSourcePath } from '@gamedevpl/contract';
import { checkUserAccess } from '../platform/auth.js';
import { registerCreatorCodeRoutes, type CreatorCodeRoutesOptions } from './creator-code.js';
import { completeWithBudget } from './tab-complete-budget.js';
import { MAX_PREFIX_CHARS, MAX_SUFFIX_CHARS, tabCompleteEnabled } from './tab-complete.js';

const inputSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(120)
      .refine((path) => isDeliverablePath(path) && !isRasterSourcePath(path)),
    prefixWindow: z.string().max(MAX_PREFIX_CHARS),
    suffixWindow: z.string().max(MAX_SUFFIX_CHARS),
  })
  .strict();

export async function registerCodeEditorRoutes(app: FastifyInstance, options: CreatorCodeRoutesOptions) {
  await registerCreatorCodeRoutes(app, options);
  app.get('/api/me/code/completion', async (request, reply) => {
    if (!checkUserAccess(request, reply)) return reply;
    reply.header('cache-control', 'no-store');
    return reply.send({ enabled: Boolean(options.tabCompleter && tabCompleteEnabled()) });
  });
  app.post(
    '/api/me/code/completion',
    { config: { rateLimit: { max: 600, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!checkUserAccess(request, reply)) return reply;
      if (!options.tabCompleter || !tabCompleteEnabled()) return reply.status(404).send({ error: 'not found' });
      const parsed = inputSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.status(400).send({ error: 'invalid completion request' });
      const result = await completeWithBudget(options, request.user!.uid, parsed.data, () => {
        request.log.warn('local code completion failed');
      });
      return reply.status(result.status).send(result.body);
    },
  );
}
