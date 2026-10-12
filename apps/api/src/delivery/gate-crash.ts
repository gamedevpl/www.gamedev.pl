// Rationale and ordering: runbooks/README.md (A28).

import { createCloudBuildOutcomeReader, type GateBuildOutcome } from './gate-build-outcome.js';
export { createCloudBuildOutcomeReader, outcomeFromBuildStatus } from './gate-build-outcome.js';
export type { GateBuildOutcome, GateBuildReaderOptions } from './gate-build-outcome.js';

import type { JobCostEntry, Store, SubmissionRecord } from '../platform/store.js';
import { canTransition, type JobTransition } from '../creation/job-state.js';
import { lastRoundActivityAt } from '../platform/quiet-round.js';
import type { GateCrash, VersionManifest } from './games-store.js';
import { gateTriggerOptionsFromEnv } from './gate-trigger.js';

// The A28 log metric keys on this exact string.
export const DELIVERY_GATE_CRASHED_MSG = 'delivery gate crashed';

const GATE_CRASH_THRESHOLD_MS = 10 * 60 * 1000;

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

export interface GateCrashProbeDeps {
  recordJobTransition: Store['recordJobTransition'];
  getManifest: (slug: string, version: string) => Promise<Partial<VersionManifest> | null>;
  putGateCrash: (slug: string, version: string, crash: GateCrash) => Promise<boolean>;
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
    const alreadyCrashed = state === 'needs_changes' && record.transitions?.at(-1)?.reason === 'gate_crashed';
    if (state !== 'submitted' && state !== 'building' && !alreadyCrashed) return null;
    if (!record.slug) return null;

    try {
      const roundGeneration = record.roundGeneration ?? 1;
      const versions = [record.previewVersion, record.deliveredVersion].filter(
        (version, index, all): version is string => Boolean(version) && all.indexOf(version) === index,
      );
      let version: string | undefined;
      let manifest: Partial<VersionManifest> | undefined;
      for (const candidate of versions) {
        const found = await deps.getManifest(record.slug, candidate);
        if (!found || (found.roundGeneration ?? 1) !== roundGeneration) continue;
        if (found.jobId !== undefined && found.jobId !== record.jobId) continue;
        if (!manifest || Date.parse(found.createdAt ?? '') > Date.parse(manifest.createdAt ?? '')) {
          version = candidate;
          manifest = found;
        }
      }
      if (!version || !manifest || manifest.gate || manifest.previewGate) return null;
      const since = manifest.createdAt ?? record.stateSince ?? record.createdAt;
      if (!Number.isFinite(Date.parse(since)) || deps.now() - Date.parse(since) <= deps.thresholdMs) return null;
      const buildId = manifest.gateCrash?.buildId ?? lastGateRunRef(record.costs, since);
      if (!buildId) return null;
      const outcome = manifest.gateCrash
        ? manifest.gateCrash.status === 'timed_out'
          ? 'timed_out'
          : 'failed'
        : await deps.readBuildOutcome(buildId);
      if (outcome !== 'failed' && outcome !== 'timed_out') return null;
      if (
        !(await deps.putGateCrash(record.slug, version, {
          buildId,
          ranAt: new Date(deps.now()).toISOString(),
          status: outcome === 'timed_out' ? 'timed_out' : 'crashed',
        }))
      )
        return null;
      if (alreadyCrashed || !canTransition(state, 'needs_changes')) return null;
      const transition: JobTransition = {
        to: 'needs_changes',
        at: new Date(deps.now()).toISOString(),
        by: 'gate',
        reason: 'gate_crashed',
      };
      if (
        !(await deps.recordJobTransition(record.jobId, transition, {
          roundGeneration,
          activityAt: lastRoundActivityAt(record),
          deliveredVersion: record.deliveredVersion,
          previewVersion: record.previewVersion,
        }))
      )
        return null;
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
  getManifest?: GateCrashProbeDeps['getManifest'];
  putGateCrash?: GateCrashProbeDeps['putGateCrash'];
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
    store: Pick<Store, 'recordJobTransition'> | null;
    gamesStore: GamesStoreLike | undefined;
    log: CrashLogger & { warn?: (context: object, message: string) => void };
    now: () => number;
  },
): Promise<JobTransition | null> {
  const readBuildOutcome = outcomeReader();
  const getManifest = deps.gamesStore?.getManifest;
  const putGateCrash = deps.gamesStore?.putGateCrash;
  if (!readBuildOutcome || !getManifest || !putGateCrash || !deps.store) return null;
  return createGateCrashProbe({
    recordJobTransition: deps.store.recordJobTransition.bind(deps.store),
    getManifest: getManifest.bind(deps.gamesStore),
    putGateCrash: putGateCrash.bind(deps.gamesStore),
    readBuildOutcome,
    log: deps.log,
    now: deps.now,
    thresholdMs: GATE_CRASH_THRESHOLD_MS,
  })(record);
}
