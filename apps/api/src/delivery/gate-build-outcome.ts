import { GoogleAuth } from 'google-auth-library';
import { identityFromBuild, type CloudGateBuild, type GateBuildIdentity } from './gate-build-identity.js';

export type GateBuildOutcome = 'running' | 'succeeded' | 'failed' | 'timed_out' | 'unknown' | 'unrelated';

// EXPIRED is a build that never got a worker.
const FAILED_BUILD_STATUSES = new Set(['FAILURE', 'INTERNAL_ERROR', 'CANCELLED', 'EXPIRED']);
const RUNNING_BUILD_STATUSES = new Set(['PENDING', 'QUEUED', 'WORKING']);

export function outcomeFromBuildStatus(status: string | undefined): GateBuildOutcome {
  if (!status) return 'unknown';
  if (status === 'TIMEOUT') return 'timed_out';
  if (status === 'SUCCESS') return 'succeeded';
  if (FAILED_BUILD_STATUSES.has(status)) return 'failed';
  if (RUNNING_BUILD_STATUSES.has(status)) return 'running';
  return 'unknown';
}

export interface GateBuildReaderOptions {
  project: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
}

// Needs no new IAM: the API already creates these builds.
export function createCloudBuildOutcomeReader(
  options: GateBuildReaderOptions,
): (buildId: string, candidate?: GateBuildIdentity) => Promise<GateBuildOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let auth: GoogleAuth | null = null;
  const getAccessToken =
    options.getAccessToken ??
    (async () => {
      auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      const token = await auth.getAccessToken();
      if (!token) throw new Error('could not obtain a Google access token to read the gate build');
      return token;
    });

  type Read = { outcome: GateBuildOutcome; identity?: ReturnType<typeof identityFromBuild> };
  const reads = new Map<string, { expiresAt: number; result: Promise<Read> }>();
  const read = async (buildId: string): Promise<Read> => {
    try {
      // Never hang the sweep on one build read.
      const response = await fetchImpl(
        `https://cloudbuild.googleapis.com/v1/projects/${options.project}/builds/${encodeURIComponent(buildId)}`,
        { headers: { authorization: `Bearer ${await getAccessToken()}` }, signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) return { outcome: 'unknown' };
      const body = (await response.json()) as CloudGateBuild;
      return { outcome: outcomeFromBuildStatus(body?.status), identity: identityFromBuild(body) };
    } catch {
      // Unknown leaves the job exactly as it was found.
      return { outcome: 'unknown' };
    }
  };
  return async (buildId, candidate) => {
    const now = Date.now();
    for (const [id, entry] of reads) if (entry.expiresAt <= now) reads.delete(id);
    let cached = reads.get(buildId);
    if (!cached) {
      cached = { expiresAt: now + 30_000, result: read(buildId) };
      reads.set(buildId, cached);
    }
    const result = await cached.result;
    if (candidate) {
      if (!result.identity) return 'unknown';
      if (
        result.identity.health ||
        result.identity.slug !== candidate.slug ||
        result.identity.version !== candidate.version
      )
        return 'unrelated';
    }
    return result.outcome;
  };
}
