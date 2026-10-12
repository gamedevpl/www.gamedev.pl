import type { JobCostEntry } from '../platform/store.js';

export interface GateBuildIdentity {
  slug: string;
  version: string;
}
export interface CloudGateBuild {
  status?: string;
  steps?: Array<{ id?: string; args?: string[] }>;
  substitutions?: Record<string, string>;
  tags?: string[];
}

export function identityFromBuild(build: CloudGateBuild): (GateBuildIdentity & { health: boolean }) | undefined {
  const command = build.steps?.find((step) => step.id === 'run-gate')?.args?.join('\n') ?? '';
  const match = command.match(/--slug\s+'([^']+)'\s+--version\s+'([^']+)'/);
  const slug = match?.[1] ?? build.substitutions?._SLUG;
  const version = match?.[2] ?? build.substitutions?._VERSION;
  if (!slug || !version) return undefined;
  return { slug, version, health: Boolean(build.tags?.includes('health') || /(?:^|\s)--health(?:\s|$)/.test(command)) };
}

export function buildRefsForCandidate(
  costs: readonly JobCostEntry[] | undefined,
  since: string,
  version: string,
): string[] {
  const floor = Date.parse(since);
  const candidates = (costs ?? [])
    .filter(
      (entry) =>
        entry.kind === 'gate_run' &&
        entry.ref &&
        (!entry.version || entry.version === version) &&
        Date.parse(entry.at) >= floor,
    )
    .sort((a, b) => Number(Boolean(b.version)) - Number(Boolean(a.version)) || Date.parse(b.at) - Date.parse(a.at));
  return [...new Set(candidates.map((entry) => entry.ref!))];
}
