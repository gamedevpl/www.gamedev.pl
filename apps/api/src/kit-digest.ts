// Loads the immutable digest paired with the current Creator Kit.

import type { GcsObjectStore } from './gcs-sign.js';
import { readFile } from 'node:fs/promises';

export const KIT_REGISTRY_OBJECT = 'kits/current.json';
export const DEFAULT_KIT_DIGEST_MAX_BYTES = 100_000;

export interface KitDigestLoader {
  load(): Promise<string | undefined>;
}

export function createGcsKitDigestLoader(options: {
  objectStore: Pick<GcsObjectStore, 'readObject'>;
  maxBytes?: number;
  log?: (context: object, message: string) => void;
}): KitDigestLoader {
  let cached: string | undefined;
  let loaded = false;
  return {
    async load(): Promise<string | undefined> {
      if (loaded) return cached;
      loaded = true;
      try {
        const registryBody = await options.objectStore.readObject(KIT_REGISTRY_OBJECT);
        if (!registryBody) return undefined;
        const registry = JSON.parse(registryBody.toString('utf8')) as { engineRef?: unknown };
        if (typeof registry.engineRef !== 'string' || !registry.engineRef) return undefined;
        const digestBody = await options.objectStore.readObject(`kits/${registry.engineRef}.digest.md`);
        if (!digestBody) return undefined;
        const maxBytes = options.maxBytes ?? DEFAULT_KIT_DIGEST_MAX_BYTES;
        if (digestBody.byteLength > maxBytes) {
          throw new Error(`Creator Kit digest exceeds ${maxBytes} bytes`);
        }
        cached = digestBody.toString('utf8');
        return cached;
      } catch (error) {
        options.log?.({ err: error }, 'could not load the Creator Kit digest');
        return undefined;
      }
    },
  };
}

export function appendKitDigest(base: string | undefined, digest: string | undefined): string | undefined {
  if (!digest) return base;
  return [base?.trim(), '## Creator Kit digest', digest.trim()].filter(Boolean).join('\n\n');
}

export function createFileKitDigestLoader(path: string): KitDigestLoader {
  let cached: string | undefined;
  return {
    async load(): Promise<string | undefined> {
      if (cached !== undefined) return cached;
      cached = await readFile(path, 'utf8');
      return cached;
    },
  };
}
