import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { DEFAULT_SIGNED_URL_TTL_SECONDS, type GcsObjectStore } from '../delivery/gcs-sign.js';
import { DEFAULT_MCP_DIGEST_MAX_BYTES, compactKitDigestForApi } from './kit-digest.js';
import {
  KIT_ENTRY,
  KitRegistryError,
  kitUnpackCommand,
  parseKitRegistry,
  parseKitSidecar,
} from '../platform/kit-registry.js';
import type { GateVerdictSummary } from '../delivery/gate-verdict.js';
import type { AgentTokenAccess } from './agent-token.js';
import type { Store, SubmissionRecord } from '../platform/store.js';

export interface AgentChannelKitRoutesDeps {
  resolveBuild: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<{ jobId: number; record: SubmissionRecord; access: AgentTokenAccess } | null>;
  store: Store | undefined;
  objectStore: GcsObjectStore | undefined;
  gateVerdict: (record: SubmissionRecord) => Promise<GateVerdictSummary | null>;
}

export function registerAgentChannelKitRoutes(app: FastifyInstance, deps: AgentChannelKitRoutesDeps): void {
  const { resolveBuild, store, objectStore, gateVerdict } = deps;

  // Current Creator Kit — engine-pinned tarball from kits/current.json.
  app.get(
    AGENT_CHANNEL_ROUTES.KIT,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;

      if (!objectStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }

      try {
        const registryBody = await objectStore.readObject('kits/current.json');
        if (!registryBody) {
          return reply.status(404).send({
            error: 'kit_registry_missing',
            message: 'kits/current.json is not published yet — the games-repo kit publisher has not run',
          });
        }
        const registry = parseKitRegistry(registryBody.toString('utf8'));
        const previousPin = resolved.record.roundKitEngineRef;
        const outdated = (await gateVerdict(resolved.record))?.status === 'kit_outdated';
        let engineRef =
          (await store!.pinRoundKitEngineRef(resolved.jobId, registry.current, outdated)) ?? registry.current;
        if (engineRef !== registry.current && !(await objectStore.objectExists(`kits/${engineRef}.tgz`))) {
          engineRef = (await store!.pinRoundKitEngineRef(resolved.jobId, registry.current, true)) ?? registry.current;
        }
        const kitEngineChanged = Boolean(previousPin) && previousPin !== engineRef;
        const sidecarBody = await objectStore.readObject(`kits/${engineRef}.json`);
        if (!sidecarBody) {
          return reply.status(404).send({
            error: 'kit_artifact_missing',
            message: `kits/${engineRef}.json sidecar is missing for the current registry entry`,
          });
        }
        const sidecar = parseKitSidecar(sidecarBody.toString('utf8'));
        if (!(await objectStore.objectExists(`kits/${engineRef}.tgz`))) {
          return reply.status(404).send({
            error: 'kit_artifact_missing',
            message: `kits/${engineRef}.tgz is missing for the current registry entry`,
          });
        }

        const kitUrl = await objectStore.signReadUrl(`kits/${engineRef}.tgz`, DEFAULT_SIGNED_URL_TTL_SECONDS);
        return reply.send({
          engineRef,
          kitUrl,
          sha256: sidecar.sha256,
          unpack: kitUnpackCommand(kitUrl),
          entry: KIT_ENTRY,
          ...(kitEngineChanged ? { kitEngineChanged: true } : {}),
          browse: {
            list: 'list_kit_files',
            search: 'search_kit_files',
            read: 'read_kit_file',
            readMany: 'read_kit_files',
            fragment: 'read_kit_file_fragment',
          },
        });
      } catch (error) {
        if (error instanceof KitRegistryError) {
          return reply.status(404).send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );

  // Prompt-ready API reference for MCP get_kit_api — see byoca-mcp SKILL.md.
  app.get(
    AGENT_CHANNEL_ROUTES.KIT_API,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      if (!objectStore) {
        return reply.status(503).send({ error: 'kit_store_unavailable', message: 'the kit store is not configured' });
      }
      try {
        const query = request.query as { engineRef?: string };
        let engineRef = query.engineRef?.trim();
        if (!engineRef) {
          const registryBody = await objectStore.readObject('kits/current.json');
          if (!registryBody) {
            return reply.status(404).send({
              error: 'kit_registry_missing',
              message: 'kits/current.json is not published yet — the games-repo kit publisher has not run',
            });
          }
          engineRef = parseKitRegistry(registryBody.toString('utf8')).current;
        }
        const digestBody = await objectStore.readObject(`kits/${engineRef}.digest.md`);
        if (!digestBody) {
          return reply.status(404).send({
            error: 'kit_artifact_missing',
            message: `kits/${engineRef}.digest.md is missing for engineRef ${engineRef}`,
          });
        }
        return reply.send({
          engineRef,
          digest: compactKitDigestForApi(digestBody.toString('utf8'), DEFAULT_MCP_DIGEST_MAX_BYTES),
        });
      } catch (error) {
        if (error instanceof KitRegistryError) {
          return reply.status(404).send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );
}
