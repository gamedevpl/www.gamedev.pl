import type { FastifyInstance } from 'fastify';
import type { AgentBackend } from '../agent-surface/agent-backend.js';
import { selfBuildConnectDays, type BuilderKind } from '../creation/builder.js';
import { shouldAutoAbandonSelfRound, type JobTransition } from '../creation/job-state.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { GitHubClient } from '../catalog/github-client.js';
import type { InternalAuthVerifier } from '../platform/internal-auth.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { SubmissionStatus, SubmissionStatusResponse } from '../platform/submission-status.js';
import { mintToken } from '../platform/submission-token.js';
import { emitOperatorAlert, emitSubmissionNotification, notifyOnTransition, type EmitDeps } from './notify.js';
import { detectOperatorAlerts, FEEDBACK_STALL_MS } from './operator-alerts.js';

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
  acknowledgeBuilderHandoff: (input: {
    issueNumber: number;
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
    acknowledgeBuilderHandoff,
    recordDerivedJobState,
    reconcileNativeJob,
    reconcileGateVerdict,
    nativeJobStatus,
    buildNotifyDeps,
  } = deps;

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

      const active = await store.listActiveSubmissions();
      let emitted = 0;
      const stalledIssues: number[] = [];
      // Oldest uncollected change request per job, so the alert pass rereads nothing.
      const pendingFeedback = new Map<number, string>();
      for (const record of active) {
        try {
          // Self round with no agent signal ever: abandon after the connect window.
          if (
            shouldAutoAbandonSelfRound({
              builder: builderOf(record),
              lastAgentSignalAt: record.lastAgentSignalAt,
              abandonedAt: record.abandonedAt,
              state: record.state,
              roundOpenedAt: record.stateSince ?? record.createdAt,
              now: now(),
              connectDays: selfBuildConnectDays(),
            })
          ) {
            const at = new Date(now()).toISOString();
            const cancelBackend = await backendFor(builderOf(record));
            const ref = record.dispatch?.refs.at(-1);
            if (cancelBackend && ref) {
              try {
                await cancelBackend.cancel(ref, record.dispatch?.credentialRefs?.[ref]);
              } catch (cancelError) {
                request.log.error(
                  { err: cancelError, issueNumber: record.issueNumber },
                  'self no-connect cancel failed',
                );
              }
            }
            await store.recordJobTransition(record.issueNumber, {
              to: 'abandoned',
              at,
              by: 'system',
              reason: 'no_connect',
            });
            await store.setSubmissionAbandoned(record.issueNumber, at);
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
              issueNumber: record.issueNumber,
              acknowledgedAt: new Date(now()).toISOString(),
              log: request.log,
            });
            continue;
          }

          // A dispatched request nobody ever collects errors nowhere; ageing makes it visible.
          const pending = await store.listPendingCreatorMessages(record.issueNumber);
          const oldest = pending[0];
          if (oldest) {
            pendingFeedback.set(record.issueNumber, oldest.createdAt);
            if (now() - Date.parse(oldest.createdAt) > FEEDBACK_STALL_MS) {
              stalledIssues.push(record.issueNumber);
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
            await store.setSubmissionLastStatus(record.issueNumber, status.status);
          }
          // Post-reconcile snapshot: the pre-reconcile record would replan the same destination.
          await recordDerivedJobState(current, status.status);
          const statusToken = mintToken(record.issueNumber, submissionTokenSecret);
          const result = await notifyOnTransition(buildNotifyDeps(), record, status, statusToken);
          if (result.emitted) emitted += 1;
        } catch (sweepError) {
          // One bad submission (deleted issue, GitHub hiccup) must not abort the sweep.
          request.log.error({ err: sweepError, issueNumber: record.issueNumber }, 'sweep item failed');
        }
      }
      // Operator alerts: a stall is time passing, so no transition writes it.

      // Idempotent per job and kind, so re-running never re-notifies.
      let alerted = 0;
      const alerts = detectOperatorAlerts(active, now(), pendingFeedback);
      // Seeding degradation stays out; the admin summary badge carries it instead.
      if (adminUids && adminUids.size > 0) {
        for (const alert of alerts) {
          try {
            const { created } = await emitOperatorAlert({ ...buildNotifyDeps(), adminUids }, alert);
            alerted += created;
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
        const publications = await store.listPublications().catch(() => []);
        for (const publication of publications) {
          const check = publication.healthCheck;
          if (!check || check.verdictAt) continue;
          try {
            const manifest = await healthGamesStore.getManifest(publication.slug, check.version);
            const health = manifest?.health;
            // A verdict older than the request is the previous run's answer.
            if (!health || Date.parse(health.ranAt) < Date.parse(check.requestedAt)) continue;

            healthResolved += 1;
            const resolved = { ...check, green: health.green, verdictAt: health.ranAt };
            if (health.green) {
              await store.setPublicationHealthCheck(publication.slug, resolved);
              continue;
            }

            unhealthy += 1;
            // Red: the baked bundle still serves, but rebuilding would fail.

            // Notified-at is written after both emits, so failures retry next sweep.
            const submission = manifest ? await store.getSubmission(manifest.issueNumber) : null;
            if (submission) {
              await emitSubmissionNotification(buildNotifyDeps(), {
                uid: submission.ownerUid,
                type: 'submission.game_health',
                issueNumber: submission.issueNumber,
                gameTitle: submission.title,
                statusToken: mintToken(submission.issueNumber, submissionTokenSecret),
              });
            }
            if (adminUids && adminUids.size > 0) {
              await emitOperatorAlert(
                { ...buildNotifyDeps(), adminUids },
                {
                  id: `op-health-${publication.slug}-${check.version}`,
                  kind: 'game_unhealthy',
                  issueNumber: manifest?.issueNumber ?? 0,
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
          } catch (healthError) {
            // One unreadable manifest must not abort the sweep — same rule as above.
            request.log.error({ err: healthError, slug: publication.slug }, 'health check read failed');
          }
        }
      }

      // Error level so a job nobody watches cannot fail quietly for weeks.
      const sweepLog =
        stalledIssues.length > 0 ? request.log.error.bind(request.log) : request.log.info.bind(request.log);
      sweepLog(
        {
          scanned: active.length,
          emitted,
          alerts: alerts.length,
          alerted,
          stalled: stalledIssues.length,
          stalledIssues,
          healthResolved,
          unhealthy,
        },
        stalledIssues.length > 0
          ? 'creator feedback undelivered past the stall threshold — no agent has collected it'
          : 'notify sweep complete',
      );
      return reply.send({
        scanned: active.length,
        emitted,
        alerts: alerts.length,
        alerted,
        stalled: stalledIssues.length,
        healthResolved,
        unhealthy,
      });
    },
  );
}
