import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { getAgentBuildExample, listAgentBuildExamples } from './agent-build-examples.js';
import { ExampleFilesError, listExampleFiles, readExampleFile, type ExampleFileStore } from './example-files.js';
import { exampleUnpackCommand } from '../platform/kit-registry.js';
import { DEFAULT_SIGNED_URL_TTL_SECONDS, type GcsObjectStore } from '../delivery/gcs-sign.js';
import type { AgentTokenAccess } from '../platform/agent-token.js';
import type { SubmissionRecord } from '../platform/store.js';

// The curated first-party exemplar cluster: catalog, tarball, and file reads.
export interface AgentChannelExamplesRoutesDeps {
  resolveBuild: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<{ jobId: number; record: SubmissionRecord; access: AgentTokenAccess } | null>;
  objectStore: GcsObjectStore | undefined;
  exampleFileStore: ExampleFileStore | null;
}

function optionalFiniteQuery(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function sendExampleFilesError(reply: FastifyReply, error: unknown): FastifyReply | null {
  if (error instanceof ExampleFilesError) {
    const status =
      error.code === 'example_store_unavailable'
        ? 503
        : error.code === 'example_unavailable' || error.code === 'example_file_missing'
          ? 404
          : 400;
    return reply.status(status).send({ error: error.code, message: error.message });
  }
  return null;
}

export function registerAgentChannelExamplesRoutes(app: FastifyInstance, deps: AgentChannelExamplesRoutesDeps): void {
  const { resolveBuild, objectStore, exampleFileStore } = deps;

  app.get(
    AGENT_CHANNEL_ROUTES.EXAMPLES,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      return reply.send({ examples: listAgentBuildExamples() });
    },
  );

  app.get(
    AGENT_CHANNEL_ROUTES.EXAMPLES_BY_SLUG,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;

      const slug = String((request.params as { slug?: string }).slug ?? '');
      const example = getAgentBuildExample(slug);
      if (!example) {
        return reply.status(404).send({ error: 'unknown_example', message: 'slug is not on the exemplar allowlist' });
      }

      if (!objectStore) {
        return reply
          .status(503)
          .send({ error: 'example_store_unavailable', message: 'the example store is not configured' });
      }

      const objectName = `examples/${example.slug}.tgz`;
      if (!(await objectStore.objectExists(objectName))) {
        return reply.status(404).send({
          error: 'example_unavailable',
          message: `no packed sources for allowlisted slug ${example.slug}`,
        });
      }

      let sha256: string | null = null;
      const sidecarBody = await objectStore.readObject(`examples/${example.slug}.json`);
      if (sidecarBody) {
        try {
          const parsed = JSON.parse(sidecarBody.toString('utf8')) as { sha256?: unknown };
          if (typeof parsed.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(parsed.sha256)) {
            sha256 = parsed.sha256.toLowerCase();
          }
        } catch {
          // A corrupt sidecar must not block the download.
        }
      }

      const tarballUrl = await objectStore.signReadUrl(objectName, DEFAULT_SIGNED_URL_TTL_SECONDS);
      return reply.send({
        slug: example.slug,
        title: example.title,
        tarballUrl,
        ...(sha256 ? { sha256 } : {}),
        unpack: exampleUnpackCommand(tarballUrl),
      });
    },
  );

  app.get(
    AGENT_CHANNEL_ROUTES.EXAMPLES_BY_SLUG_FILES,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;

      const example = getAgentBuildExample(String((request.params as { slug?: string }).slug ?? ''));
      if (!example) {
        return reply.status(404).send({ error: 'unknown_example', message: 'slug is not on the exemplar allowlist' });
      }
      if (!exampleFileStore) {
        return reply
          .status(503)
          .send({ error: 'example_store_unavailable', message: 'the example store is not configured' });
      }

      try {
        const query = request.query as { prefix?: string; limit?: string; offset?: string };
        const tree = await exampleFileStore.loadTree(example.slug);
        return reply.send(
          listExampleFiles(tree, {
            prefix: query.prefix,
            limit: optionalFiniteQuery(query.limit),
            offset: optionalFiniteQuery(query.offset),
          }),
        );
      } catch (error) {
        const sent = sendExampleFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );

  app.get(
    AGENT_CHANNEL_ROUTES.EXAMPLES_BY_SLUG_FILE,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;

      const example = getAgentBuildExample(String((request.params as { slug?: string }).slug ?? ''));
      if (!example) {
        return reply.status(404).send({ error: 'unknown_example', message: 'slug is not on the exemplar allowlist' });
      }
      if (!exampleFileStore) {
        return reply
          .status(503)
          .send({ error: 'example_store_unavailable', message: 'the example store is not configured' });
      }

      try {
        const query = request.query as { path?: string; encoding?: string };
        const encoding = query.encoding === 'base64' ? 'base64' : query.encoding === 'utf8' ? 'utf8' : undefined;
        if (query.encoding && !encoding) {
          return reply.status(400).send({ error: 'example_query_invalid', message: 'encoding must be utf8 or base64' });
        }
        const tree = await exampleFileStore.loadTree(example.slug);
        return reply.send(readExampleFile(tree, query.path ?? '', { ...(encoding ? { encoding } : {}) }));
      } catch (error) {
        const sent = sendExampleFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );
}
