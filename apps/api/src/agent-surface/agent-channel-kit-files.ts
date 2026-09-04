import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import {
  KitFilesError,
  listKitFiles,
  readKitFile,
  readKitFileFragment,
  readKitFiles,
  searchKitFiles,
  type KitFileStore,
} from './kit-files.js';
import { KitRegistryError } from '../platform/kit-registry.js';
import type { AgentTokenAccess } from '../platform/agent-token.js';
import type { SubmissionRecord } from '../platform/store.js';

// The Creator Kit read cluster: single file, batch, and windowed fragment reads.
export interface AgentChannelKitFileRoutesDeps {
  resolveBuild: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<{ jobId: number; record: SubmissionRecord; access: AgentTokenAccess } | null>;
  kitFileStore: KitFileStore | null;
}

function optionalFiniteQuery(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function sendKitFilesError(reply: FastifyReply, error: unknown): FastifyReply | null {
  if (error instanceof KitFilesError) {
    const status =
      error.code === 'kit_store_unavailable'
        ? 503
        : error.code === 'kit_registry_missing' ||
            error.code === 'kit_registry_invalid' ||
            error.code === 'kit_artifact_missing' ||
            error.code === 'kit_file_missing'
          ? 404
          : error.code === 'kit_revision_unsupported'
            ? 409
            : 400;
    return reply.status(status).send({ error: error.code, message: error.message });
  }
  if (error instanceof KitRegistryError) {
    return reply.status(404).send({ error: error.code, message: error.message });
  }
  return null;
}

export function registerAgentChannelKitFileRoutes(app: FastifyInstance, deps: AgentChannelKitFileRoutesDeps): void {
  const { resolveBuild, kitFileStore } = deps;

  app.get(
    AGENT_CHANNEL_ROUTES.KIT_FILES,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      if (!kitFileStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }
      try {
        const query = request.query as {
          prefix?: string;
          glob?: string;
          limit?: string;
          offset?: string;
          engineRef?: string;
        };
        const tree = await kitFileStore.loadTree(query.engineRef);
        return reply.send(
          listKitFiles(tree, {
            prefix: query.prefix,
            glob: query.glob,
            limit: optionalFiniteQuery(query.limit),
            offset: optionalFiniteQuery(query.offset),
          }),
        );
      } catch (error) {
        const sent = sendKitFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );

  app.get(
    AGENT_CHANNEL_ROUTES.KIT_SEARCH,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      if (!kitFileStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }
      try {
        const query = request.query as {
          q?: string;
          query?: string;
          prefix?: string;
          limit?: string;
          engineRef?: string;
        };
        const tree = await kitFileStore.loadTree(query.engineRef);
        return reply.send(
          searchKitFiles(tree, {
            query: query.q ?? query.query ?? '',
            prefix: query.prefix,
            limit: optionalFiniteQuery(query.limit),
          }),
        );
      } catch (error) {
        const sent = sendKitFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );

  app.get(
    AGENT_CHANNEL_ROUTES.KIT_FILE,
    { config: { rateLimit: { max: 240, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      if (!kitFileStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }
      try {
        const query = request.query as { path?: string; encoding?: string; engineRef?: string };
        if (!query.path?.trim()) {
          return reply.status(400).send({ error: 'kit_path_invalid', message: 'path is required' });
        }
        const encoding = query.encoding === 'base64' || query.encoding === 'utf8' ? query.encoding : undefined;
        const tree = await kitFileStore.loadTree(query.engineRef);
        return reply.send(readKitFile(tree, query.path, { encoding }));
      } catch (error) {
        const sent = sendKitFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );

  app.post(
    AGENT_CHANNEL_ROUTES.KIT_FILES_READ,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      if (!kitFileStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }
      try {
        const body = (request.body ?? {}) as {
          paths?: unknown;
          encoding?: string;
          engineRef?: string;
        };
        if (!Array.isArray(body.paths)) {
          return reply.status(400).send({ error: 'kit_query_invalid', message: 'paths must be an array of strings' });
        }
        const paths = body.paths.filter((path): path is string => typeof path === 'string');
        if (paths.length === 0) {
          return reply.status(400).send({ error: 'kit_query_invalid', message: 'paths must be a non-empty array' });
        }
        const encoding = body.encoding === 'base64' || body.encoding === 'utf8' ? body.encoding : undefined;
        const tree = await kitFileStore.loadTree(body.engineRef);
        return reply.send(readKitFiles(tree, paths, { encoding }));
      } catch (error) {
        const sent = sendKitFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );

  app.get(
    AGENT_CHANNEL_ROUTES.KIT_FILE_FRAGMENT,
    { config: { rateLimit: { max: 240, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      if (!kitFileStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }
      try {
        const query = request.query as {
          path?: string;
          offset?: string;
          limit?: string;
          unit?: string;
          encoding?: string;
          engineRef?: string;
        };
        if (!query.path?.trim()) {
          return reply.status(400).send({ error: 'kit_path_invalid', message: 'path is required' });
        }
        const encoding = query.encoding === 'base64' || query.encoding === 'utf8' ? query.encoding : undefined;
        const unit = query.unit === 'bytes' || query.unit === 'lines' ? query.unit : undefined;
        const tree = await kitFileStore.loadTree(query.engineRef);
        return reply.send(
          readKitFileFragment(tree, query.path, {
            offset: optionalFiniteQuery(query.offset),
            limit: optionalFiniteQuery(query.limit),
            unit,
            encoding,
          }),
        );
      } catch (error) {
        const sent = sendKitFilesError(reply, error);
        if (sent) return sent;
        throw error;
      }
    },
  );
}
