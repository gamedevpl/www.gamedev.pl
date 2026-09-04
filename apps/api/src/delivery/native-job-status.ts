import { detectStall, toSubmissionStatus } from '../creation/job-state.js';
import { gateCrashStall } from './gate-crash.js';
import { sealRefusal } from '../platform/seal-preview.js';
import { toRecentBuilds } from './recent-builds.js';
import { revisionOriginOf } from './build-status.js';
import { stripPlaytestContext } from '../platform/playtest-context.js';
import type { BuilderKind } from '../creation/builder.js';
import type { ManagedAvailabilityGate } from '../agent-surface/managed-availability.js';
import type { GamesStore } from './games-store.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { SubmissionStatusResponse } from '../platform/submission-status.js';

export interface NativeJobStatusOptions {
  store?: Store;
  now: () => number;
  builderOf: (record: SubmissionRecord | null | undefined) => BuilderKind;
  managedAvailabilityGate?: ManagedAvailabilityGate | null;
  gamesStore?: GamesStore;
  // N1: injected so this module has no value-level creation/ import.
  sessionCrashStall: (record: SubmissionRecord) => void;
  codeSurfaceEnabled: () => boolean;
  isLiveAgentRound: (record: SubmissionRecord) => boolean;
  selfBuildDeliveryCap: () => number;
}

export interface NativeJobStatusAssembler {
  nativeJobStatus(record: SubmissionRecord): Promise<SubmissionStatusResponse>;
}

// Single status derivation, shared by the status route and the notify sweep.
export function createNativeJobStatusAssembler(options: NativeJobStatusOptions): NativeJobStatusAssembler {
  const {
    store,
    now,
    builderOf,
    managedAvailabilityGate,
    gamesStore,
    sessionCrashStall,
    codeSurfaceEnabled,
    isLiveAgentRound,
    selfBuildDeliveryCap,
  } = options;

  // Projects the job's own record — no issue or PR here.
  async function nativeJobStatus(record: SubmissionRecord): Promise<SubmissionStatusResponse> {
    const state = record.state ?? 'queued';
    const status: SubmissionStatusResponse = {
      status: record.abandonedAt ? 'abandoned' : toSubmissionStatus(state),
      ...(record.abandonedAt ? {} : { phase: state }),
      jobId: record.jobId,
      ...(record.slug ? { slug: record.slug } : {}),
      ...((record.transitions ?? []).some((transition) => transition.reason === 'remix_saved')
        ? { draftOrigin: 'remix' as const }
        : {}),
    };
    const playableVersion = record.previewVersion ?? record.deliveredVersion;
    if (record.slug && playableVersion) {
      if (gamesStore?.getDerivedArtifact) {
        try {
          const [bundle, previewHtml] = await Promise.all([
            gamesStore.getDerivedArtifact(record.slug, playableVersion, 'bundle.html'),
            gamesStore.getDerivedArtifact(record.slug, playableVersion, 'preview.html'),
          ]);
          if (bundle || previewHtml) {
            status.preview = { slug: record.slug };
          }
        } catch {
          // Advisory only — a lookup failure never blocks the status response.
        }
      }
    }
    if ((state === 'failed' || state === 'needs_changes') && !record.abandonedAt) {
      const lastBounce = [...(record.transitions ?? [])].reverse().find((transition) => transition.to === state);
      status.failure = {
        reason: lastBounce?.reason ?? (state === 'failed' ? 'unknown' : 'gate_red'),
      };
    }
    if (store) {
      const messages = await store.listCreatorMessages(record.jobId, { limit: 20 });
      if (messages.length > 0 || playableVersion) {
        status.progress = {
          headSha: playableVersion ?? '',
          commits: [],
          checklist: [],
          revisions: messages.map((message) => ({
            text: stripPlaytestContext(message.text),
            createdAt: message.createdAt,
            ...(revisionOriginOf(message) ? { origin: revisionOriginOf(message) } : {}),
            delivered: Boolean(message.deliveredAt),
            ...(message.textLocalized && message.locale
              ? { textLocalized: stripPlaytestContext(message.textLocalized), locale: message.locale }
              : {}),
          })),
        };
      }
    }
    const stall =
      detectStall({
        state,
        stateSince: record.stateSince ?? record.createdAt,
        lastAgentSignalAt: record.lastAgentSignalAt,
        agentState: record.agentState,
        agentEndedAt: record.agentEndedAt,
        now: now(),
        builder: builderOf(record),
      }) ??
      gateCrashStall(record) ??
      sessionCrashStall(record);
    if (stall) status.stall = stall;
    if (record.slug && playableVersion) {
      if (gamesStore?.getManifest) {
        try {
          const manifest = await gamesStore.getManifest(record.slug, playableVersion);
          if (manifest?.previewGate) {
            status.previewGate = {
              green: manifest.previewGate.green,
              ranAt: manifest.previewGate.ranAt,
              ...(manifest.previewGate.report ? { report: manifest.previewGate.report } : {}),
              ...(manifest.previewGate.status ? { status: manifest.previewGate.status } : {}),
            };
          }
          if (manifest?.gateProgress && !manifest.gate && !manifest.previewGate) {
            status.gateProgress = manifest.gateProgress;
          }
          if (sealRefusal(record) === null && manifest?.previewGate?.green) {
            status.canSeal = true;
          }
        } catch {
          // Advisory only.
        }
      }
    }
    if (record.slug) {
      if (gamesStore?.listVersions) {
        try {
          const versions = await gamesStore.listVersions(record.slug, { limit: 8 });
          status.recentBuilds = toRecentBuilds(versions);
          if (gamesStore.countVersions) {
            status.totalBuildsCount = await gamesStore.countVersions(record.slug);
          } else {
            status.totalBuildsCount = versions.length;
          }
        } catch {
          // Advisory only.
        }
      }
    }
    if (record.lastAgentSignalAt) status.lastAgentSignalAt = record.lastAgentSignalAt;
    if (record.lastAgentPresence) status.lastAgentPresence = record.lastAgentPresence;
    if (record.agentEndedAt) status.agentEndedAt = record.agentEndedAt;
    const roundBuilder = record.builder;
    if (roundBuilder) status.builder = roundBuilder;
    const lastBuilder = record.defaultBuilder ?? record.builder;
    if (lastBuilder) status.defaultBuilder = lastBuilder;
    if (record.slug) {
      const killed = !codeSurfaceEnabled();
      const liveAgent = isLiveAgentRound(record);
      status.codeSurface = {
        available: !killed,
        readOnly: killed || liveAgent,
        ...(killed ? { reason: 'killed' as const } : liveAgent ? { reason: 'agent_round' as const } : {}),
      };
    }
    if (managedAvailabilityGate) {
      status.platformBuilder = await managedAvailabilityGate.peek(
        record.ownerUid,
        new Date(now()).toISOString().slice(0, 10),
      );
    }
    if (record.builderHandoff && record.builderHandoff.awaitsAgentAck !== false) {
      status.builderHandoff = {
        target: record.builderHandoff.to,
        requestedAt: record.builderHandoff.requestedAt,
        ...(record.builderHandoff.acknowledgedAt ? { acknowledgedAt: record.builderHandoff.acknowledgedAt } : {}),
      };
    }
    if (builderOf(record) === 'self' && !status.failure && (record.roundDeliveryCount ?? 0) >= selfBuildDeliveryCap()) {
      status.failure = { reason: 'self_build_delivery_cap' };
    }
    const queuedTransition = (record.transitions ?? []).find((transition) => transition.to === 'queued');
    if (queuedTransition?.reason === 'agent_open_round') {
      status.openedBy = 'agent';
    } else if (queuedTransition?.reason === 'improvement_requested') {
      status.openedBy = 'creator';
    }
    return status;
  }

  return { nativeJobStatus };
}
