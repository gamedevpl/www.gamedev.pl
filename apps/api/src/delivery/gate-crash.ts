// Rationale and ordering: docs/runbooks/README.md (A28).

import { GoogleAuth } from 'google-auth-library';

import type { JobCostEntry, SubmissionRecord } from '../platform/store.js';
import { canTransition, type JobStall, type JobTransition } from '../creation/job-state.js';
import { gateTriggerOptionsFromEnv } from './gate-trigger.js';

// The A28 log metric keys on this exact string.
export const DELIVERY_GATE_CRASHED_MSG = 'delivery gate crashed';

export type GateBuildOutcome = 'running' | 'succeeded' | 'failed' | 'unknown';

// EXPIRED is a build that never got a worker.
const FAILED_BUILD_STATUSES = new Set(['FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED']);
const RUNNING_BUILD_STATUSES = new Set(['PENDING', 'QUEUED', 'WORKING']);

// Matches DEFAULT_STALL_THRESHOLDS.gateNotStartedMs.
const GATE_CRASH_THRESHOLD_MS = 10 * 60 * 1000;

export function outcomeFromBuildStatus(status: string | undefined): GateBuildOutcome {
  if (!status) return 'unknown';
  if (status === 'SUCCESS') return 'succeeded';
  if (FAILED_BUILD_STATUSES.has(status)) return 'failed';
  if (RUNNING_BUILD_STATUSES.has(status)) return 'running';
  return 'unknown';
}

// Reuses the cost ledger's gate_run ref.
export function lastGateRunRef(costs: JobCostEntry[] | undefined, since: string | undefined): string | undefined {
  const floor = since ? Date.parse(since) : NaN;
  let best: { at: number; ref: string } | undefined;
  for (const entry of costs ?? []) {
    if (entry.kind !== 'gate_run' || !entry.ref) continue;
    const at = Date.parse(entry.at);
    if (!Number.isFinite(at)) continue;
    // Scoped to this round only.
    if (Number.isFinite(floor) && at < floor) continue;
    if (!best || at >= best.at) best = { at, ref: entry.ref };
  }
  return best?.ref;
}

// Append-ordered, so the last entry is current; `at` is not ordered.
export function gateCrashStall(record: Pick<SubmissionRecord, 'state' | 'transitions'>): JobStall | null {
  if (record.state !== 'needs_changes') return null;
  const last = record.transitions?.[record.transitions.length - 1];
  return last?.reason === 'gate_crashed' ? 'gate_crashed' : null;
}

interface CrashLogger {
  info: (context: object, message: string) => void;
}

export function logDeliveryGateCrashed(
  log: CrashLogger,
  input: { jobId: number; roundGeneration: number; slug: string; version?: string; buildId: string },
): void {
  log.info(
    {
      delivery: {
        jobId: input.jobId,
        roundGeneration: input.roundGeneration,
        slug: input.slug,
        ...(input.version ? { version: input.version } : {}),
        buildId: input.buildId,
      },
    },
    DELIVERY_GATE_CRASHED_MSG,
  );
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

  return async (buildId: string): Promise<GateBuildOutcome> => {
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
}

export interface GateCrashProbeDeps {
  recordJobTransition: (jobId: number, transition: JobTransition) => Promise<boolean>;
  getManifest: (slug: string, version: string) => Promise<{ gate?: unknown; previewGate?: unknown } | null>;
  readBuildOutcome: (buildId: string) => Promise<GateBuildOutcome>;
  log: CrashLogger & { warn?: (context: object, message: string) => void };
  now: () => number;
  thresholdMs: number;
}

export function createGateCrashProbe(
  deps: GateCrashProbeDeps,
): (record: SubmissionRecord) => Promise<JobTransition | null> {
  return async (record: SubmissionRecord): Promise<JobTransition | null> => {
    const state = record.state ?? 'submitted';
    if (state !== 'submitted') return null;
    if (!record.slug) return null;

    const since = Date.parse(record.stateSince ?? record.createdAt ?? '');
    if (!Number.isFinite(since) || deps.now() - since <= deps.thresholdMs) return null;

    const buildId = lastGateRunRef(record.costs, record.stateSince);
    if (!buildId) return null;

    try {
      const roundGeneration = record.roundGeneration ?? 1;
      const versions = [record.previewVersion, record.deliveredVersion].filter(
        (version, index, all): version is string => Boolean(version) && all.indexOf(version) === index,
      );
      let version: string | undefined;
      for (const candidate of versions) {
        const manifest = await deps.getManifest(record.slug, candidate);
        // A red verdict also fails the build.
        if (manifest?.gate || manifest?.previewGate) return null;
        if (manifest) version = candidate;
      }

      if ((await deps.readBuildOutcome(buildId)) !== 'failed') return null;
      if (!canTransition(state, 'needs_changes')) return null;

      // needs_changes, not failed: the round stays open for a re-delivery.
      const transition: JobTransition = {
        to: 'needs_changes',
        at: new Date(deps.now()).toISOString(),
        by: 'gate',
        reason: 'gate_crashed',
      };
      if (!(await deps.recordJobTransition(record.jobId, transition))) return null;
      logDeliveryGateCrashed(deps.log, {
        jobId: record.jobId,
        roundGeneration,
        slug: record.slug,
        ...(version ? { version } : {}),
        buildId,
      });
      return transition;
    } catch (error) {
      deps.log.warn?.({ err: error, jobId: record.jobId }, 'could not read the gate build outcome');
      return null;
    }
  };
}

interface GamesStoreLike {
  getManifest?: (slug: string, version: string) => Promise<{ gate?: unknown; previewGate?: unknown } | null>;
}

let cachedReader: ((buildId: string) => Promise<GateBuildOutcome>) | null | undefined;

// Null means unconfigured: local dev gets no probe, like the trigger.
function outcomeReader(): ((buildId: string) => Promise<GateBuildOutcome>) | null {
  if (cachedReader !== undefined) return cachedReader;
  const project = gateTriggerOptionsFromEnv()?.project;
  cachedReader = project ? createCloudBuildOutcomeReader({ project }) : null;
  return cachedReader;
}

// Test seam: forget the memoized reader after changing env.
export function resetGateCrashProbe(): void {
  cachedReader = undefined;
}

export async function probeGateCrash(
  record: SubmissionRecord,
  deps: {
    store: { recordJobTransition: (jobId: number, transition: JobTransition) => Promise<boolean> } | null;
    gamesStore: GamesStoreLike | undefined;
    log: CrashLogger & { warn?: (context: object, message: string) => void };
    now: () => number;
  },
): Promise<JobTransition | null> {
  const readBuildOutcome = outcomeReader();
  const getManifest = deps.gamesStore?.getManifest;
  if (!readBuildOutcome || !getManifest || !deps.store) return null;
  return createGateCrashProbe({
    recordJobTransition: deps.store.recordJobTransition.bind(deps.store),
    getManifest: getManifest.bind(deps.gamesStore),
    readBuildOutcome,
    log: deps.log,
    now: deps.now,
    thresholdMs: GATE_CRASH_THRESHOLD_MS,
  })(record);
}
