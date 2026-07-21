import cors from '@fastify/cors';
import type { GameGenerator } from '@gamedevpl/game-generator';
import { generatorRunner, Orchestrator, QueueFullError } from '@gamedevpl/orchestrator';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assembleGameHtml, EmptyProjectError, ProjectTooLargeError } from './assemble.js';
import { createGenerator } from './generator.js';

const GenerateRequestSchema = z.object({
  prompt: z.string().trim().min(1, 'prompt is required').max(500, 'prompt is too long'),
});

const SubmitJobSchema = GenerateRequestSchema.extend({
  // Anonymous submissions all share a bucket until real accounts exist, which is
  // deliberately conservative: they throttle against each other.
  creatorId: z.string().trim().min(1).max(100).default('anonymous'),
});

export interface BuildAppOptions {
  generator?: GameGenerator;
  logger?: boolean;
  orchestrator?: Orchestrator;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const generator = options.generator ?? createGenerator();
  const orchestrator = options.orchestrator ?? new Orchestrator({ runner: generatorRunner(generator) });
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(cors, { origin: true });

  app.get('/api/health', async () => ({ status: 'ok', provider: generator.name }));

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
      if (error instanceof EmptyProjectError || error instanceof ProjectTooLargeError) {
        request.log.error({ err: error }, 'generated project failed hygiene checks');
        return reply.status(502).send({ error: 'game generation failed' });
      }
      throw error;
    }
  });

  // Async path: submissions queue instead of holding a request open, so bursts
  // are absorbed and expensive generation stays under a concurrency cap.
  app.post('/api/jobs', async (request, reply) => {
    const parsedRequest = SubmitJobSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return reply.status(400).send({ error: parsedRequest.error.issues[0]?.message ?? 'invalid request' });
    }

    try {
      const job = orchestrator.submit(parsedRequest.data);
      return reply.status(202).send({ id: job.id, state: job.state, createdAt: job.createdAt });
    } catch (error) {
      if (error instanceof QueueFullError) {
        return reply.status(429).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = orchestrator.get(id);
    if (!job) {
      return reply.status(404).send({ error: 'job not found' });
    }

    const base = { id: job.id, state: job.state, createdAt: job.createdAt };

    if (job.state === 'failed') {
      return { ...base, error: job.error ?? 'game generation failed' };
    }

    if (job.state === 'succeeded' && job.result) {
      try {
        return {
          ...base,
          title: job.result.title,
          description: job.result.description,
          html: assembleGameHtml(job.result),
        };
      } catch (error) {
        if (error instanceof EmptyProjectError || error instanceof ProjectTooLargeError) {
          request.log.error({ err: error }, 'generated project failed hygiene checks');
          return { ...base, state: 'failed' as const, error: 'game generation failed' };
        }
        throw error;
      }
    }

    return base;
  });

  return app;
}
