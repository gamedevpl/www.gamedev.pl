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
  const pinned = new Set([registry.current, registry.previous].filter((ref): ref is string => ref !== null));
  const byVersion = new Map<string, { engineRef: string; sha256: string; packedAt?: string }>();
  const parsedSupported = Object.entries(sidecars)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([engineRef, raw]) => {
      if (!/^[a-f0-9]{40}$/.test(engineRef)) throw new Error('Kit sidecar has no immutable engine identity');
      const sidecar = parseKitSidecar(raw);
      return isKitEngineRefSupported(engineRef, registry, sidecar.version)
        ? [{ engineRef, sha256: sidecar.sha256, version: sidecar.version, packedAt: sidecar.packedAt }]
        : [];
    });

  for (const item of parsedSupported) {
    if (!item.version) {
      pinned.add(item.engineRef);
      continue;
    }
    const existing = byVersion.get(item.version);
    if (!existing) {
      byVersion.set(item.version, item);
    } else {
      const existingDate = existing.packedAt ?? '';
      const itemDate = item.packedAt ?? '';
      if (itemDate > existingDate || (itemDate === existingDate && item.engineRef > existing.engineRef)) {
        byVersion.set(item.version, item);
      }
    }
  }

  const selectedRefs = new Set(pinned);
  for (const item of byVersion.values()) {
    selectedRefs.add(item.engineRef);
  }

  const kits = parsedSupported
    .filter((item) => selectedRefs.has(item.engineRef))
    .map(({ engineRef, sha256 }) => ({ engineRef, sha256 }));

  return { registrySha256: sha256(registryRaw), kits };
}

export const SUPPORTED_KITS_CHANGED_MESSAGE = 'Supported Kits changed during API verification; retry deployment';

export type VerifiedApiKit = {
  modes: string[];
  evidence: unknown;
};

export type ApiKitCompatibilityReceipt = {
  version: 1;
  consumerSha: string;
  candidateUrl: string;
  image?: string;
  plan: ApiKitPlan;
  results: VerifiedApiKit[];
};

export function isApiKitPlanUnchanged(expected: ApiKitPlan, actual: ApiKitPlan): boolean {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

export function apiKitIdentityKey(kit: Pick<ApiKitPlan['kits'][number], 'engineRef' | 'sha256'>): string {
  return `${kit.engineRef}:${kit.sha256}`;
}

export function assertApiKitPlanUnchanged(expected: ApiKitPlan, actual: ApiKitPlan): void {
  if (!isApiKitPlanUnchanged(expected, actual)) {
    throw new Error(SUPPORTED_KITS_CHANGED_MESSAGE);
  }
}

export function validateApiKitBootModes(modes: unknown): asserts modes is string[] {
  const serialized = JSON.stringify(modes);
  if (serialized !== '["ordinary-probe"]' && serialized !== '["ordinary-probe","hot-probe"]') {
    throw new Error('Invalid API compatibility boot modes');
  }
}

export function parseVerifiedApiKitReceipt(
  value: unknown,
  expected: { consumerSha: string; candidateUrl: string; image?: string },
): ApiKitCompatibilityReceipt {
  const receipt = value as Partial<ApiKitCompatibilityReceipt> | null;
  if (
    !receipt ||
    receipt.version !== 1 ||
    receipt.consumerSha !== expected.consumerSha ||
    receipt.candidateUrl !== expected.candidateUrl ||
    (expected.image !== undefined && receipt.image !== expected.image) ||
    !Array.isArray(receipt.plan?.kits) ||
    !Array.isArray(receipt.results) ||
    receipt.results.length !== receipt.plan.kits.length
  ) {
    throw new Error('Missing API compatibility receipt');
  }
  for (const [index, kit] of receipt.plan.kits.entries()) {
    const entry = receipt.results[index];
    if (!entry) throw new Error('Missing API compatibility receipt');
    validateApiKitBootModes(entry.modes);
    validateApiKitEvidence(entry.evidence, {
      ...kit,
      consumerSha: expected.consumerSha,
      modes: entry.modes,
    });
  }
  return receipt as ApiKitCompatibilityReceipt;
}

export async function verifyApiKitPlanWithRetry(options: {
  readPlan: () => Promise<ApiKitPlan>;
  verifyMissingKits: (kits: ApiKitPlan['kits'], attempt: number) => Promise<ReadonlyMap<string, VerifiedApiKit>>;
  validateKit: (kit: ApiKitPlan['kits'][number], verified: VerifiedApiKit) => void;
  assertCandidate: () => Promise<void>;
  initialVerified?: ReadonlyMap<string, VerifiedApiKit>;
  maxAttempts?: number;
  onRetry?: (attempt: number, maxAttempts: number) => void;
}): Promise<{ plan: ApiKitPlan; results: VerifiedApiKit[]; attempts: number }> {
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('maxAttempts must be a positive integer');
  }
  const verifiedByKey = new Map<string, VerifiedApiKit>(options.initialVerified);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const expected = await options.readPlan();
    const missing = expected.kits.filter((kit) => !verifiedByKey.has(apiKitIdentityKey(kit)));
    if (missing.length > 0) {
      const fresh = await options.verifyMissingKits(missing, attempt);
      for (const kit of missing) {
        const key = apiKitIdentityKey(kit);
        const item = fresh.get(key);
        if (!item) throw new Error('Missing or mismatched API/Kit browser evidence');
        options.validateKit(kit, item);
        verifiedByKey.set(key, item);
      }
    }
    const results = expected.kits.map((kit) => {
      const item = verifiedByKey.get(apiKitIdentityKey(kit));
      if (!item) throw new Error('Missing or mismatched API/Kit browser evidence');
      options.validateKit(kit, item);
      return item;
    });
    await options.assertCandidate();
    const latest = await options.readPlan();
    if (isApiKitPlanUnchanged(expected, latest)) {
      return { plan: expected, results, attempts: attempt };
    }
    if (attempt === maxAttempts) {
      assertApiKitPlanUnchanged(expected, latest);
    }
    options.onRetry?.(attempt, maxAttempts);
  }
  throw new Error(SUPPORTED_KITS_CHANGED_MESSAGE);
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
