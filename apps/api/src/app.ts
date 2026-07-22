import cors from '@fastify/cors';
import type { GameGenerator } from '@gamedevpl/game-generator';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assembleGameHtml, CredentialLeakError, EmptyProjectError, ProjectTooLargeError } from './assemble.js';
import { createGenerator } from './generator.js';
import { registerSubmissionRoutes, type SubmissionRoutesOptions } from './submissions.js';

const GenerateRequestSchema = z.object({
  prompt: z.string().trim().min(1, 'prompt is required').max(500, 'prompt is too long'),
});

export interface BuildAppOptions {
  generator?: GameGenerator;
  logger?: boolean;
  submissionRoutes?: SubmissionRoutesOptions;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const generator = options.generator ?? createGenerator();
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(cors, { origin: true });
  await registerSubmissionRoutes(app, options.submissionRoutes);

  app.get('/api/health', async () => ({ status: 'ok', provider: generator.name }));

  app.get('/api/version', async () => ({ name: 'gamedev-pl', version: '0.0.0' }));

  app.post('/api/generate-game', async (request, reply) => {
    const parsedRequest = GenerateRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return reply.status(400).send({ error: parsedRequest.error.issues[0]?.message ?? 'invalid request' });
    }

    const project = await generator.generate(parsedRequest.data.prompt);

    // Generated code isn't schema-validatable — the client runs it in a sandboxed
    // iframe. We only assemble it into one document and enforce basic hygiene here.
    try {
      const html = assembleGameHtml(project);
      return { title: project.title, description: project.description, html };
    } catch (error) {
      if (
        error instanceof EmptyProjectError ||
        error instanceof ProjectTooLargeError ||
        error instanceof CredentialLeakError
      ) {
        request.log.error({ err: error }, 'generated project failed hygiene checks');
        return reply.status(502).send({ error: 'game generation failed' });
      }
      throw error;
    }
  });

  return app;
}
