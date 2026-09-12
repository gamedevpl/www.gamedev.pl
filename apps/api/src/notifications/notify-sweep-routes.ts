import type { FastifyInstance } from 'fastify';
import type { AgentBackend } from '../agent-surface/agent-backend.js';
import type { BuilderKind } from '../creation/builder.js';
import { selfBuildConnectDays } from '../platform/self-build-connect-days.js';
import { createSweepCadence } from '../platform/sweep-cadence.js';
import { isSweepActive } from '../platform/sweep-scope.js';
import { lastRoundActivityAt, quietRoundDays, shouldAutoAbandonQuietRound } from '../platform/quiet-round.js';
import { closeJob, type CloseJobDeps } from '../creation/close-job.js';
import { shouldAutoAbandonSelfRound, type JobTransition } from '../creation/job-state.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { GitHubClient } from '../catalog/github-client.js';
import type { InternalAuthVerifier } from '../platform/internal-auth.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { PublicationRecord } from '../delivery/games-store.js';
import type { SubmissionStatus, SubmissionStatusResponse } from '../platform/submission-status.js';
import { mintToken } from '../platform/submission-token.js';
import { emitOperatorAlert, emitSubmissionNotification, notifyOnTransition, type EmitDeps } from './notify.js';
import { detectOperatorAlerts, FEEDBACK_STALL_MS } from './operator-alerts.js';
import { uncollectedFeedbackCause, type UncollectedFeedbackCause } from './uncollected-feedback.js';

// Max wait for a handoff ack before the sweep forces it.
const HANDOFF_ACK_STALL_MS = 10 * 60 * 1000;

export interface NotifySweepRoutesDeps {
  internalAuthVerifier: InternalAuthVerifier;
  githubClient: GitHubClient | null;
  submissionTokenSecret: string | undefined;
  store: Store | undefined;
  gamesStore: GamesStore | undefined;
  adminUids: Set<string> | undefined;
  now: () => number;
  builderOf: (record: SubmissionRecord | null | undefined) => BuilderKind;
  backendFor: (builder: BuilderKind | undefined) => Promise<AgentBackend | undefined>;
  releaseWorkspace: CloseJobDeps['releaseWorkspace'];
  invalidateStatusCache: (jobId: number) => void;
  acknowledgeBuilderHandoff: (input: {
    jobId: number;
    acknowledgedAt: string;
    log: { error: (context: object, message: string) => void };
  }) => Promise<{ started: boolean; reason?: string }>;
  recordDerivedJobState: (record: SubmissionRecord, observed: SubmissionStatus) => Promise<JobTransition | null>;
  reconcileNativeJob: (record: SubmissionRecord) => Promise<JobTransition | null>;
  reconcileGateVerdict: (record: SubmissionRecord, sweep?: boolean) => Promise<JobTransition | null>;
  nativeJobStatus: (record: SubmissionRecord) => Promise<SubmissionStatusResponse>;
  buildNotifyDeps: () => EmitDeps;
}

export function registerNotifySweepRoutes(app: FastifyInstance, deps: NotifySweepRoutesDeps): void {
  const {
    internalAuthVerifier,
    githubClient,
    submissionTokenSecret,
    store,
    gamesStore,
    adminUids,
    now,
    builderOf,
    backendFor,
    releaseWorkspace,
    invalidateStatusCache,
    acknowledgeBuilderHandoff,
    recordDerivedJobState,
    reconcileNativeJob,
    reconcileGateVerdict,
    nativeJobStatus,
    buildNotifyDeps,
  } = deps;

  const cadence = createSweepCadence();

  // An alert id is stable, so a remembered hit is final.
  const alertsAlreadyEmitted = new Set<string>();
  const MAX_REMEMBERED_ALERTS = 2_000;
  function rememberAlert(id: string): void {
    if (alertsAlreadyEmitted.size >= MAX_REMEMBERED_ALERTS) alertsAlreadyEmitted.clear();
    alertsAlreadyEmitted.add(id);
  }

  // Scanning games every two minutes was most of the day's reads.
  const publicationsTtlMs = 10 * 60_000;
  let publicationsCache: { expiresAt: number; value: PublicationRecord[] } | null = null;
  async function publicationsForHealth(): Promise<PublicationRecord[]> {
    if (!store) return [];
    if (publicationsCache && publicationsCache.expiresAt > now()) return publicationsCache.value;
    const value = await store.listPublications().catch(() => []);
    publicationsCache = { expiresAt: now() + publicationsTtlMs, value };
    return value;
  }

  // Closed-tab backstop: Cloud Scheduler POSTs an OIDC token here.

  // Reuses the status poll derivation and its idempotent emit.

  // OIDC authenticates the caller; the hourly ceiling only guards runaways.
  app.post(
    '/api/internal/notify-sweep',
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!(await internalAuthVerifier.verify(request.headers.authorization))) {
        return reply.status(401).send({ error: 'unauthorized' });
      }
      if (!githubClient || !submissionTokenSecret || !store) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }

      const closeDeps: CloseJobDeps = { store, now, backendFor, builderOf, releaseWorkspace, invalidateStatusCache };
      let closed = 0;
      const closedIds = new Set<number>();
      // Active rounds are a subset of open ones: one read.
      const openRounds = await store.listOpenRounds();
      const activityByJob = new Map<number, number>();
      for (const record of openRounds) {
        const activityAt = lastRoundActivityAt(record);
        activityByJob.set(record.jobId, activityAt);
        const reason = shouldAutoAbandonSelfRound({
          builder: builderOf(record),
          lastAgentSignalAt: record.lastAgentSignalAt,
          abandonedAt: record.abandonedAt,
          state: record.state,
          roundOpenedAt: record.stateSince ?? record.createdAt,
          now: now(),
          connectDays: selfBuildConnectDays(),
        })
          ? 'no_connect'
          : shouldAutoAbandonQuietRound({
                state: record.state,
                abandonedAt: record.abandonedAt,
                lastActivityAt: activityAt,
                now: now(),
                quietDays: quietRoundDays(),
              })
            ? 'quiet'
            : null;
        if (!reason) continue;
        try {
          // A claim, not a write: refused if the round moved meanwhile.
          const result = await closeJob(closeDeps, {
            record,
            to: 'abandoned',
            by: 'system',
            reason,
            log: request.log,
            guard: { activityAt },
          });
          if (!result.closed) continue;
          closed += 1;
          closedIds.add(record.jobId);
          cadence.forget(record.jobId);
          request.log.warn({ jobId: record.jobId, state: record.state, reason }, 'open round closed by the sweep');
        } catch (closeError) {
          request.log.error({ err: closeError, jobId: record.jobId, reason }, 'round close failed');
        }
      }

      const active = openRounds.filter((record) => isSweepActive(record) && !closedIds.has(record.jobId));
      let emitted = 0;
      let deferred = 0;
      const stalledIssues: number[] = [];
      const stalledCauses: Record<string, UncollectedFeedbackCause> = {};
      // Oldest uncollected change request per job, so the alert pass rereads nothing.
      const pendingFeedback = new Map<number, string>();
      for (const record of active) {
        try {
          // A motionless record cannot change between runs; derive it less often.
          const activityAt = activityByJob.get(record.jobId) ?? lastRoundActivityAt(record);
          if (!cadence.isDue({ jobId: record.jobId, now: now(), lastActivityAt: activityAt })) {
            deferred += 1;
            continue;
          }

          // Stale handoff ack: outgoing agent may be gone.
          if (
            record.builderHandoff &&
            record.builderHandoff.awaitsAgentAck !== false &&
            !record.builderHandoff.acknowledgedAt &&
            now() - Date.parse(record.builderHandoff.requestedAt) > HANDOFF_ACK_STALL_MS
          ) {
            await acknowledgeBuilderHandoff({
              jobId: record.jobId,
              acknowledgedAt: new Date(now()).toISOString(),
              log: request.log,
            });
            continue;
          }

          // A dispatched request nobody ever collects errors nowhere; ageing makes it visible.
          const pending = await store.listPendingCreatorMessages(record.jobId);
          const oldest = pending[0];
          if (oldest) {
            pendingFeedback.set(record.jobId, oldest.createdAt);
            if (now() - Date.parse(oldest.createdAt) > FEEDBACK_STALL_MS) {
              stalledIssues.push(record.jobId);
              stalledCauses[String(record.jobId)] = uncollectedFeedbackCause(record);
            }
          }
          // Same derivation the status poll uses, so sweep and page cannot disagree.
          const observed = (await reconcileNativeJob(record)) ?? (await reconcileGateVerdict(record, true));
          const current = observed
            ? {
                ...record,
                state: observed.to,
                stateSince: observed.at,
                transitions: [...(record.transitions ?? []), observed],
              }
            : record;
          const status = await nativeJobStatus(current);
          // Recorded whether or not anyone is notified, so the rail stops deriving.
          if (record.lastStatus !== status.status) {
            await store.setSubmissionLastStatus(record.jobId, status.status);
          }
          // Post-reconcile snapshot: the pre-reconcile record would replan the same destination.
          await recordDerivedJobState(current, status.status);
          const statusToken = mintToken(record.jobId, submissionTokenSecret);
          const result = await notifyOnTransition(buildNotifyDeps(), record, status, statusToken);
          if (result.emitted) emitted += 1;

          // Uncollected feedback or a fresh move keeps the record on every run.
          cadence.reschedule({
            jobId: record.jobId,
            now: now(),
            lastActivityAt: activityAt,
            hot: pending.length > 0 || Boolean(observed) || record.lastStatus !== status.status,
          });
        } catch (sweepError) {
          // One bad submission (deleted issue, GitHub hiccup) must not abort the sweep.
          request.log.error({ err: sweepError, jobId: record.jobId }, 'sweep item failed');
        }
      }
      // Operator alerts: a stall is time passing, so no transition writes it.

      // Idempotent per job and kind, so re-running never re-notifies.
      let alerted = 0;
      const alerts = detectOperatorAlerts(active, now(), pendingFeedback);
      // Seeding degradation stays out; the admin summary badge carries it instead.
      let alertsSkipped = 0;
      if (adminUids && adminUids.size > 0) {
        for (const alert of alerts) {
          if (alertsAlreadyEmitted.has(alert.id)) {
            alertsSkipped += 1;
            continue;
          }
          try {
            const { created } = await emitOperatorAlert({ ...buildNotifyDeps(), adminUids }, alert);
            alerted += created;
            if (created === 0) rememberAlert(alert.id);
          } catch (alertError) {
            request.log.error({ err: alertError, alert: alert.id }, 'operator alert emit failed');
          }
        }
      }

      // Reads back re-gate verdicts, one manifest read per pending check.
      let healthResolved = 0;
      let unhealthy = 0;
      const healthGamesStore = gamesStore;
      if (healthGamesStore) {
        const publications = await publicationsForHealth();
        for (const candidate of publications) {
          if (!candidate.healthCheck || candidate.healthCheck.verdictAt) continue;
          try {
            // The cached list nominates; the record decides. One read per pending check.
            const publication = (await store.getPublication(candidate.slug)) ?? candidate;
            const check = publication.healthCheck;
            if (!check || check.verdictAt) continue;
            const manifest = await healthGamesStore.getManifest(publication.slug, check.version);
            const health = manifest?.health;
            // A verdict older than the request is the previous run's answer.
            if (!health || Date.parse(health.ranAt) < Date.parse(check.requestedAt)) continue;

            healthResolved += 1;
            const resolved = { ...check, green: health.green, verdictAt: health.ranAt };
            if (health.green) {
              await store.setPublicationHealthCheck(publication.slug, resolved);
              publicationsCache = null;
              continue;
            }

            unhealthy += 1;
            // Red: the baked bundle still serves, but rebuilding would fail.

            // Notified-at is written after both emits, so failures retry next sweep.
            const submission = manifest ? await store.getSubmission(manifest.jobId) : null;
            if (submission) {
              await emitSubmissionNotification(buildNotifyDeps(), {
                uid: submission.ownerUid,
                type: 'submission.game_health',
                jobId: submission.jobId,
                gameTitle: submission.title,
                statusToken: mintToken(submission.jobId, submissionTokenSecret),
              });
            }
            if (adminUids && adminUids.size > 0) {
              await emitOperatorAlert(
                { ...buildNotifyDeps(), adminUids },
                {
                  id: `op-health-${publication.slug}-${check.version}`,
                  kind: 'game_unhealthy',
                  jobId: manifest?.jobId ?? 0,
                  title: submission?.title ?? publication.slug,
                  ownerUid: submission?.ownerUid ?? '',
                  slug: publication.slug,
                  since: health.ranAt,
                },
              );
            }
            await store.setPublicationHealthCheck(publication.slug, {
              ...resolved,
              notifiedAt: new Date(now()).toISOString(),
            });
            publicationsCache = null;
          } catch (healthError) {
            // One unreadable manifest must not abort the sweep — same rule as above.
            request.log.error({ err: healthError, slug: candidate.slug }, 'health check read failed');
          }
        }
      }

      // Error level so a job nobody watches cannot fail quietly for weeks.
      const sweepLog =
        stalledIssues.length > 0 ? request.log.error.bind(request.log) : request.log.info.bind(request.log);
      sweepLog(
        {
          scanned: active.length,
          deferred,
          closed,
          emitted,
          alerts: alerts.length,
          alerted,
          alertsSkipped,
          stalled: stalledIssues.length,
          stalledIssues,
          stalledCauses,
          healthResolved,
          unhealthy,
        },
        stalledIssues.length > 0
          ? 'creator feedback undelivered past the stall threshold — no agent has collected it'
          : 'notify sweep complete',
      );
      return reply.send({
        scanned: active.length,
        deferred,
        closed,
        emitted,
        alertsSkipped,
        alerts: alerts.length,
        alerted,
        stalled: stalledIssues.length,
        stalledCauses,
        healthResolved,
        unhealthy,
      });
    },
  );
}
