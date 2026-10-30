import { createHash } from 'node:crypto';
import { parseKitRegistry, isKitEngineRefSupported } from './kit-window.js';
import { parseKitSidecar } from './kit-registry.js';

export type ApiKitPlan = {
  registrySha256: string;
  kits: { engineRef: string; sha256: string }[];
};

export function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function apiKitPlan(registryRaw: string, sidecars: Record<string, string>): ApiKitPlan {
  const registry = parseKitRegistry(registryRaw);
  for (const ref of [registry.current, registry.previous].filter((ref) => ref !== null)) {
    if (!/^[a-f0-9]{40}$/.test(ref) || !Object.hasOwn(sidecars, ref)) {
      throw new Error('Supported Kit has no immutable sidecar');
    }
  }
  const kits = Object.entries(sidecars)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([engineRef, raw]) => {
      if (!/^[a-f0-9]{40}$/.test(engineRef)) throw new Error('Kit sidecar has no immutable engine identity');
      const sidecar = parseKitSidecar(raw);
      return isKitEngineRefSupported(engineRef, registry, sidecar.version)
        ? [{ engineRef, sha256: sidecar.sha256 }]
        : [];
    });
  return { registrySha256: sha256(registryRaw), kits };
}

export function assertApiKitPlanUnchanged(expected: ApiKitPlan, actual: ApiKitPlan): void {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error('Supported Kits changed during API verification; retry deployment');
  }
}

export function validateApiKitEvidence(
  value: unknown,
  expected: ApiKitPlan['kits'][number] & { consumerSha: string; modes: string[] },
): void {
  const evidence = value as {
    version?: unknown;
    consumerSha?: unknown;
    engineRef?: unknown;
    tarballSha256?: unknown;
    artifacts?: { slug?: unknown; engineRef?: unknown; htmlSha256?: unknown; frames?: unknown }[];
  } | null;
  if (
    !evidence ||
    evidence.version !== 1 ||
    evidence.consumerSha !== expected.consumerSha ||
    evidence.engineRef !== expected.engineRef ||
    evidence.tarballSha256 !== expected.sha256 ||
    !Array.isArray(evidence.artifacts) ||
    evidence.artifacts.length !== expected.modes.length
  ) {
    throw new Error('Missing or mismatched API/Kit browser evidence');
  }
  const modes = new Set();
  for (const artifact of evidence.artifacts) {
    if (
      !artifact ||
      artifact.engineRef !== expected.engineRef ||
      typeof artifact.htmlSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(artifact.htmlSha256) ||
      typeof artifact.frames !== 'number' ||
      !Number.isSafeInteger(artifact.frames) ||
      artifact.frames < 6
    ) {
      throw new Error('Invalid API/Kit browser artifact');
    }
    modes.add(artifact.slug);
  }
  if (!expected.modes.every((mode) => modes.has(mode))) throw new Error('Missing API/Kit boot mode');
}
