import { GoogleAuth } from 'google-auth-library';

export type GateBuildOutcome = 'running' | 'succeeded' | 'failed' | 'timed_out' | 'unknown';

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
): (buildId: string) => Promise<GateBuildOutcome> {
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

  const reads = new Map<string, { expiresAt: number; result: Promise<GateBuildOutcome> }>();
  const read = async (buildId: string): Promise<GateBuildOutcome> => {
    try {
      // Never hang the sweep on one build read.
      const response = await fetchImpl(
        `https://cloudbuild.googleapis.com/v1/projects/${options.project}/builds/${encodeURIComponent(buildId)}`,
        { headers: { authorization: `Bearer ${await getAccessToken()}` }, signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) return 'unknown';
      const body = (await response.json()) as { status?: string };
      return outcomeFromBuildStatus(body?.status);
    } catch {
      // Unknown leaves the job exactly as it was found.
      return 'unknown';
    }
  };
  return (buildId) => {
    const now = Date.now();
    for (const [id, entry] of reads) if (entry.expiresAt <= now) reads.delete(id);
    const cached = reads.get(buildId);
    if (cached) return cached.result;
    const result = read(buildId);
    reads.set(buildId, { expiresAt: now + 30_000, result });
    return result;
  };
}
