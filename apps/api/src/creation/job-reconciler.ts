import { deriveGateStatusString, derivePreviewGateStatus } from '@gamedevpl/contract';
import type { AgentBackend } from '../agent-surface/agent-backend.js';
import { postGateScreenshotToThread } from '../delivery/gate-screenshot.js';
import { probeGateCrash } from '../delivery/gate-crash.js';
import type { GamesStore } from '../delivery/games-store.js';
import {
  builderLabelFromRecord,
  failedStageFromProgress,
  logDeliveryGateVerdict,
  type DeliveryGateStatus,
} from '../platform/delivery-metrics.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { BuilderKind } from './builder.js';
import { canTransition, reconcileAgentObservation, type JobState, type JobTransition } from './job-state.js';
import { clearObserveFailures, noteObserveFailure, sessionCrashTransition } from './session-crash.js';

// A logger, narrowed to what the reconcilers actually call on it.
interface ReconcilerLog {
  error: (context: object, message: string) => void;
  warn: (context: object, message: string) => void;
  info: (context: object, message: string) => void;
}

export interface JobReconcilerDeps {
  store: Store | undefined;
  gamesStore: GamesStore | undefined;
  log: ReconcilerLog;
  now: () => number;

  // How long a job stays silent before its backend is asked.
  observeQuietMs: number;

  // Sessions that finish without uploading get this many second chances.
  maxDeliveryNudges: number;
  backendFor: (builder: BuilderKind | undefined) => Promise<AgentBackend | undefined>;
  builderOf: (record: SubmissionRecord | null | undefined) => BuilderKind;
  releaseWorkspace: (
    issueNumber: number,
    workspace: string,
    log: { error: (context: object, message: string) => void },
    backendName?: string,
  ) => Promise<void>;
  resumeBuild: (input: {
    issueNumber: number;
    feedback: string;
    locale: string;
    log: { error: (context: object, message: string) => void };
    undelivered?: boolean;
  }) => Promise<unknown>;
  acknowledgeBuilderHandoff: (input: {
    issueNumber: number;
    acknowledgedAt: string;
    log: { error: (context: object, message: string) => void };
  }) => Promise<{ started: boolean; reason?: string }>;
}

export interface JobReconciler {
  reconcileNativeJob(record: SubmissionRecord): Promise<JobTransition | null>;
  reconcileGateVerdict(record: SubmissionRecord, sweep?: boolean): Promise<JobTransition | null>;
}

// Reads what happened to a round and moves the job onto it.

// Two authorities: the agent's own session, and our gate's verdict.
export function createJobReconciler(deps: JobReconcilerDeps): JobReconciler {
  const {
    store,
    gamesStore,
    log,
    now,
    observeQuietMs,
    maxDeliveryNudges,
    backendFor,
    builderOf,
    releaseWorkspace,
    resumeBuild,
    acknowledgeBuilderHandoff,
  } = deps;

  // Asks the backend what happened to a job whose agent went quiet.

  // The build channel only carries good news; a dead session reports nothing.

  // Without this a page says building until the end of time.

  // Throttled by the status cache and by the quiet window above.
  async function reconcileNativeJob(record: SubmissionRecord): Promise<JobTransition | null> {
    if (!store) return null;
    const selected = await backendFor(builderOf(record));
    if (!selected) return null;
    const refs = record.dispatch?.refs;
    if (!refs || refs.length === 0) return null;
    const state = record.state ?? 'queued';
    const lastRef = refs[refs.length - 1];
    // Cost settles apart from state: usage is final at session end.

    // A placeholder credit stays until an observation overwrites it.
    const costPending = (record.costs ?? []).some(
      (entry) => entry.kind === 'agent_session' && entry.ref === lastRef && !entry.creditsMeasured && !entry.tokens,
    );
    // Observe lifecycle only while the agent's lifecycle is still the question.

    // Past the agent, a session is no longer authoritative for state.
    const agentActive = state === 'queued' || state === 'dispatched' || state === 'building';
    if (!agentActive && !costPending) return null;
    const quietFrom = record.lastAgentSignalAt ?? record.stateSince ?? record.createdAt;
    const silence = now() - Date.parse(quietFrom);
    // A job whose branch we never learned is always asked about.

    // Without the branch a revision restarts the game from nothing.
    const needsWorkspace = !record.dispatch?.workspace && selected.name !== 'self';
    // Self rounds project from channel signals, so ask on the first signal.
    const selfNeedsProjection =
      selected.name === 'self' && agentActive && Boolean(record.lastAgentSignalAt) && state !== 'building';
    // Platform tasks sit queued while GitHub boots; that is not quiet building.

    // Ask every poll, so building comes from a signal not a timer.
    const awaitingSessionStart = selected.name !== 'self' && (state === 'queued' || state === 'dispatched');
    // Cost-only polls skip the quiet window; the session is already done.
    if (
      !needsWorkspace &&
      !selfNeedsProjection &&
      !awaitingSessionStart &&
      agentActive &&
      (!Number.isFinite(silence) || silence < observeQuietMs)
    ) {
      return null;
    }
    // The last ref owns the job; a resume superseded the others.

    // Its own try, so only a vendor error counts toward session_crashed.
    let observation;
    try {
      observation = await selected.observe(lastRef, {
        hasCandidate: Boolean(record.deliveredVersion) || (record.roundDeliveryCount ?? 0) > 0,
        // Pull-delivery backends harvest inside observe.
        issueNumber: record.issueNumber,
        ...(record.slug ? { slug: record.slug } : {}),
        // Durable generation — process memory is empty after restart.
        roundGeneration: record.roundGeneration ?? 1,
      });
      clearObserveFailures(lastRef);
    } catch (error) {
      log.error({ err: error, issueNumber: record.issueNumber }, 'agent observation failed');
      if (!noteObserveFailure(lastRef)) return null;
      const transition = sessionCrashTransition(state, now);
      if (!transition) return null;
      const recorded = await store.recordJobTransition(record.issueNumber, transition);
      return recorded ? transition : null;
    }
    try {
      if (!observation) return null;
      if (observation.sessionTokens) {
        try {
          await store.setJobCostTokens(record.issueNumber, lastRef, observation.sessionTokens);
        } catch (error) {
          log.error({ err: error, issueNumber: record.issueNumber }, 'could not reconcile agent session tokens');
        }
      }
      if (observation.sessionCredits !== undefined) {
        try {
          await store.setJobCostCredits(record.issueNumber, lastRef, observation.sessionCredits);
        } catch (error) {
          log.error({ err: error, issueNumber: record.issueNumber }, 'could not reconcile agent session cost');
        }
      }
      // Persist vendor state even when the job does not move.
      if (observation.state !== record.agentState) {
        try {
          await store.setSubmissionAgentState(record.issueNumber, observation.state);
        } catch (error) {
          log.error({ err: error, issueNumber: record.issueNumber }, 'could not store agent task state');
        }
      }
      // Re-read after harvest; do not skip the gate.
      const fresh = await store.getSubmission(record.issueNumber);
      const stateAfterObserve = (fresh?.state ?? state) as JobState;
      const stillAgentActive =
        stateAfterObserve === 'queued' || stateAfterObserve === 'dispatched' || stateAfterObserve === 'building';
      // Cost-only poll past the agent: write credits and stop.

      // A late transition would snatch a delivered candidate back.
      if (!stillAgentActive) return null;
      if (observation.workspace && observation.workspace !== record.dispatch?.workspace) {
        await store.setDispatchWorkspace(record.issueNumber, observation.workspace);
        // Learning the branch proves it forked, so the seed has no reader.

        // The tightest safe lifetime: earlier could delete under a cloning session.
        if (record.dispatch?.seedWorkspace && record.dispatch.seedWorkspace !== observation.workspace) {
          await releaseWorkspace(record.issueNumber, record.dispatch.seedWorkspace, log, record.dispatch.backend);
          await store.clearDispatchSeedWorkspace(record.issueNumber);
        }
      }
      const result = reconcileAgentObservation(stateAfterObserve, observation);
      if (!result) return null;
      // Stale: a handoff already dispatched a newer ref.
      if (fresh?.dispatch?.refs.at(-1) !== lastRef) return null;

      // Finished but uploaded nothing is the one failure worth answering.

      // Every other ending would just be bought twice by sending it back.

      // Here the work likely exists, and only the upload is missing.

      // Judged from our own record, never from what the session claims.
      if (result.reason === 'task_completed_without_delivery' && (record.deliveryNudges ?? 0) < maxDeliveryNudges) {
        const nudges = await store.recordDeliveryNudge(record.issueNumber);
        // Counted before dispatch, so a throw still spends the budget.
        if (nudges <= maxDeliveryNudges) {
          log.warn(
            { issueNumber: record.issueNumber, nudge: nudges, workspace: record.dispatch?.workspace },
            'session finished without delivering; sending it back',
          );
          await resumeBuild({
            issueNumber: record.issueNumber,
            feedback: '',
            locale: record.locale ?? 'en',
            log,
            undelivered: true,
          });
          // resumeBuild already moved the job back; reporting a failure would lie.
          return null;
        }
      }

      const transition: JobTransition = {
        to: result.to,
        at: new Date(now()).toISOString(),
        by: 'reconciler',
        reason: result.reason,
      };
      const recorded = await store.recordJobTransition(record.issueNumber, transition);
      return recorded ? transition : null;
    } catch (error) {
      // Best effort: the answer is the status the record already has.
      log.error({ err: error, issueNumber: record.issueNumber }, 'agent observation failed');
      return null;
    }
  }

  // Reads our own gate's verdict off the delivered version.

  // The gate runs in Cloud Build, writes to the manifest, and exits.

  // Nothing told the job, so a delivered game sat in submitted forever.

  // Read rather than pushed back: the verdict is already durable here.

  // A callback would duplicate a fact the manifest already holds.
  async function reconcileGateVerdict(record: SubmissionRecord, sweep = false): Promise<JobTransition | null> {
    if (!gamesStore || !store || !record.slug) return null;
    const state = record.state ?? 'queued';
    if (state !== 'building' && state !== 'submitted') return null;
    try {
      const roundGeneration = record.roundGeneration ?? 1;
      // Retained versions may belong to an older round.

      // Previews first, accepting only this round's manifest.
      const candidateVersions = [record.previewVersion, record.deliveredVersion].filter(
        (version, index, versions): version is string => Boolean(version) && versions.indexOf(version) === index,
      );
      let version: string | undefined;
      let manifest: Awaited<ReturnType<GamesStore['getManifest']>> = null;
      for (const candidate of candidateVersions) {
        const candidateManifest = await gamesStore.getManifest(record.slug, candidate);
        if (candidateManifest?.roundGeneration === roundGeneration) {
          version = candidate;
          manifest = candidateManifest;
          break;
        }
      }
      if (!version || !manifest) return sweep ? probeGateCrash(record, { store, gamesStore, log, now }) : null;
      const emitGateMetric = async (input: {
        mode: 'preview' | 'publish';
        outcome: 'passed' | 'failed';
        status: DeliveryGateStatus;
        failedStage?: ReturnType<typeof failedStageFromProgress>;
      }) => {
        const key = `${version}:${input.status}`;
        if (record.roundLastGateMetricKey === key) return;
        await store.setRoundLastGateMetricKey(record.issueNumber, key);
        record.roundLastGateMetricKey = key;
        logDeliveryGateVerdict(log, {
          issueNumber: record.issueNumber,
          roundGeneration,
          builder: builderLabelFromRecord(record.builder, record.dispatch?.backend),
          mode: input.mode,
          outcome: input.outcome,
          status: input.status,
          ...(input.failedStage ? { failedStage: input.failedStage } : {}),
        });
      };

      const verdict = manifest?.gate;
      if (verdict && record.deliveredVersion) {
        const status: DeliveryGateStatus = deriveGateStatusString(verdict);
        await emitGateMetric({
          mode: 'publish',
          outcome: verdict.green ? 'passed' : 'failed',
          status,
          ...(verdict.green ? {} : { failedStage: failedStageFromProgress(manifest?.gateProgress?.stage) }),
        });
        // Green means publishable, never published.

        // The human review it waits for is the moderation boundary.
        const to = verdict.green ? 'ready_for_review' : 'needs_changes';
        if (!canTransition(state, to)) return null;
        const transition: JobTransition = {
          to,
          at: verdict.ranAt,
          by: 'gate',
          reason: verdict.green ? 'gate_green' : verdict.status === 'kit_outdated' ? 'kit_outdated' : 'gate_red',
        };
        const recorded = await store.recordJobTransition(record.issueNumber, transition);
        if (!recorded) return null;
        // The outgoing token just died; resume any pending handoff now.
        if (to === 'ready_for_review' && record.builderHandoff?.awaitsAgentAck) {
          await acknowledgeBuilderHandoff({
            issueNumber: record.issueNumber,
            acknowledgedAt: transition.at,
            log,
          }).catch((error) => {
            log.error({ err: error, issueNumber: record.issueNumber }, 'failed to resume handoff at round close');
          });
        }
        // First time acting on this verdict: post the capture frame.

        // The creator sees what the platform check saw, on the usual path.
        if (verdict.screenshot) {
          await postGateScreenshotToThread({
            store,
            gamesStore,
            issueNumber: record.issueNumber,
            slug: record.slug,
            version: record.deliveredVersion,
            screenshotPath: verdict.screenshot,
          }).catch((error) => {
            log.warn({ err: error, issueNumber: record.issueNumber }, 'could not post gate screenshot');
          });
        }
        return transition;
      }
      // mode=preview never writes manifest.gate — still emit metrics for green/red.
      const preview = manifest?.previewGate;
      if (!preview) return sweep ? probeGateCrash(record, { store, gamesStore, log, now }) : null;
      await emitGateMetric({
        mode: 'preview',
        outcome: preview.green ? 'passed' : 'failed',
        status: derivePreviewGateStatus(preview),
        ...(preview.green ? {} : { failedStage: failedStageFromProgress(manifest?.gateProgress?.stage) }),
      });
      if (preview.green) return null;
      const to = 'needs_changes' as const;
      if (!canTransition(state, to)) return null;
      const transition: JobTransition = {
        to,
        at: preview.ranAt,
        by: 'gate',
        reason: preview.status === 'kit_outdated' ? 'kit_outdated' : 'gate_red',
      };
      const recorded = await store.recordJobTransition(record.issueNumber, transition);
      if (!recorded) return null;
      if (preview.screenshot) {
        await postGateScreenshotToThread({
          store,
          gamesStore,
          issueNumber: record.issueNumber,
          slug: record.slug,
          version,
          screenshotPath: preview.screenshot,
        }).catch((error) => {
          log.warn({ err: error, issueNumber: record.issueNumber }, 'could not post gate screenshot');
        });
      }
      return transition;
    } catch (error) {
      log.error({ err: error, issueNumber: record.issueNumber }, 'could not read the gate verdict');
      return null;
    }
  }
  return { reconcileNativeJob, reconcileGateVerdict };
}
