import type { FastifyInstance } from 'fastify';
import { DEFAULT_SIGNED_URL_TTL_SECONDS, type GcsObjectStore } from '../delivery/gcs-sign.js';
import { parseKitSidecar } from './kit-registry.js';
import { KIT_REGISTRY_OBJECT, isKitEngineRefSupported, parseKitRegistry } from './kit-window.js';

export const PUBLIC_KIT_ROUTE_PREFIX = '/api/kit/';

const ENGINE_REF_TGZ = /^([a-f0-9]{40})\.tgz$/;

export function publicKitDownloadEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.PUBLIC_KIT_DOWNLOAD ?? '').trim().toLowerCase() === 'true';
}

export function registerPublicKitRoutes(
  app: FastifyInstance,
  deps: { objectStore: GcsObjectStore | undefined; enabled: boolean },
): void {
  app.get<{ Params: { file: string } }>(
    `${PUBLIC_KIT_ROUTE_PREFIX}:file`,
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const match = ENGINE_REF_TGZ.exec(request.params.file);
      if (!deps.enabled || !deps.objectStore || !match) return reply.status(404).send({ error: 'not found' });
      const engineRef = match[1]!;
      const registryBody = await deps.objectStore.readObject(KIT_REGISTRY_OBJECT);
      if (!registryBody) return reply.status(404).send({ error: 'not found' });
      // Same window the gate accepts, sidecar version included.
      const version = await deps.objectStore
        .readObject(`kits/${engineRef}.json`)
        .then((body) => (body ? parseKitSidecar(body.toString('utf8')).version : undefined))
        .catch(() => undefined);
      if (!isKitEngineRefSupported(engineRef, parseKitRegistry(registryBody.toString('utf8')), version)) {
        return reply.status(404).send({ error: 'not found' });
      }
      const object = `kits/${engineRef}.tgz`;
      if (!(await deps.objectStore.objectExists(object))) return reply.status(404).send({ error: 'not found' });
      request.log.info({ engineRef }, 'public kit download');
      const url = await deps.objectStore.signReadUrl(object, DEFAULT_SIGNED_URL_TTL_SECONDS);
      return reply.header('cache-control', 'private, no-store').redirect(url, 302);
    },
  );
}
