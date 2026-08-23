/**
 * Keeping the published shelf honest about whether it would still build.
 *
 * A published game serves from a baked, self-contained bundle, so nothing about a moving
 * engine can break what a player loads today. What drifts is *rebuildability*: the game's
 * sources are still pinned to the GameKit they were accepted against, and one day an
 * improvement round against them would fail. The health re-gate is how we find that out
 * before a creator does, and the nudge that follows is how the fix gets started — an
 * improvement round rebuilds the game against the current engine, which is the outcome
 * worth wanting. Breaking and nudging, rather than pinning forever or pulling the game.
 *
 * Two callers, one definition of "start a health check": the operator's button on the
 * published shelf, and the sweep below. The manual one is a judgement call about a single
 * game; the sweep is the standing policy. Both go through `startHealthCheck` so a run
 * started either way books its cost and records its request identically — an operator
 * clicking Re-gate must not produce a differently-shaped record from the scheduler.
 *
 * The sweep only ever *starts* runs. Reading the verdict back and nudging the creator is
 * already the notify sweep's job (submissions.ts), because a gate run writes to the
 * manifest and exits — the same read-back pattern the acceptance gate uses, for the same
 * reason: the verdict is durable in the store, and a callback would be a second source of
 * a fact the manifest already holds.
 */

import type { FastifyInstance } from 'fastify';
import type { GamesStore, PublicationRecord } from '../delivery/games-store.js';
import type { GitHubClient } from './github-client.js';
import type { InternalAuthVerifier } from '../internal-auth.js';
import type { Store } from '../store.js';

/** The configured Cloud Build gate trigger — the same seam the delivery path uses. */
export type HealthGateTrigger = (input: {
  issueNumber: number;
  slug: string;
  version: string;
  mode?: 'health';
}) => Promise<{ buildId?: string } | void> | void;

export interface HealthCheckDeps {
  store: Store;
  gamesStore: GamesStore;
  gateTrigger: HealthGateTrigger;
  now?: () => number;
}

export type HealthCheckStart =
  { started: true; version: string; buildId?: string } | { started: false; reason: 'version_missing' };

/**
 * Starts one health re-gate of a published game's current version.
 *
 * Records the request before the verdict exists, replacing any previous check wholesale:
 * the question is always about the latest run, and a stale verdict left beside a fresh
 * request would read as an answer to it.
 */
export async function startHealthCheck(
  deps: HealthCheckDeps,
  publication: Pick<PublicationRecord, 'slug' | 'currentVersion'>,
): Promise<HealthCheckStart> {
  const now = deps.now ?? Date.now;
  const { slug, currentVersion: version } = publication;

  const manifest = await deps.gamesStore.getManifest(slug, version);
  if (!manifest) return { started: false, reason: 'version_missing' };

  const requestedAt = new Date(now()).toISOString();
  const triggered = await deps.gateTrigger({ issueNumber: manifest.issueNumber, slug, version, mode: 'health' });
  const buildId = triggered && typeof triggered === 'object' ? triggered.buildId : undefined;

  await deps.store.setPublicationHealthCheck(slug, { version, requestedAt, ...(buildId ? { buildId } : {}) });
  // Booked to the job that built the game — a health run is a gate run on the bill, and
  // the manifest is the only place the issue number is known.
  if (buildId) {
    await deps.store.recordJobCost(manifest.issueNumber, {
      kind: 'gate_run',
      at: requestedAt,
      by: 'cloud-build',
      ref: buildId,
    });
  }

  return { started: true, version, ...(buildId ? { buildId } : {}) };
}

/**
 * How long a requested check may sit without a verdict before the sweep gives up waiting
 * and lets the game be picked again.
 *
 * A gate run is minutes, not hours; six hours past the request means the build never
 * started, died without writing, or was cancelled. Without this the first lost build
 * would park that game as permanently "in flight" and it would never be checked again —
 * exactly the silent gap this whole sweep exists to close.
 */
const IN_FLIGHT_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * How long a game stays un-rechecked after a red verdict.
 *
 * The creator has already been nudged, and re-gating a game we know is broken every time
 * the engine moves buys a Cloud Build run and a second identical nudge for no new
 * information. It is also not how a red game recovers: the fix is an improvement round,
 * which produces a *new version* checked by the acceptance gate, which moves the game's
 * last-checked commit forward and makes it fresh here without the sweep touching it. The
 * cooldown only governs the other case — a game left broken — and two weeks is long
 * enough that an upstream engine fix is worth re-testing for. The console's Re-gate
 * button ignores it entirely; that is an operator making a deliberate call.
 */
const RED_RECHECK_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * How many checks one sweep run may start.
 *
 * The bound is the whole reason this is a sweep and not a webhook. An engine push
 * invalidates the entire shelf at once, and fanning out one Cloud Build run per published
 * game on every push is a bill and a thundering herd. Starting a few per run, oldest
 * first, walks the shelf over a few days and costs the same in total — while a push that
 * changes nothing about the engine costs nothing at all, because staleness is decided by
 * comparing commits rather than by the push happening.
 */
const DEFAULT_BATCH = 3;

/**
 * Reads the batch size from configuration, keeping an explicit **zero**.
 *
 * Zero is not a degenerate value here, it is the loop's pause switch: the sweep still
 * runs, still resolves the head, and still reports every game it *would* have started as
 * `deferred` — so spending can be stopped, and what it was about to spend on inspected,
 * without deleting the scheduler job or unsetting its audience. `Number(x) || undefined`
 * would quietly turn that into the default and start three builds instead of none.
 *
 * Anything that is not a whole non-negative number — a typo, a unit suffix, an empty
 * string — is unset rather than zero. Failing to the default is the safe direction for a
 * misconfiguration: the sweep keeps working at a bounded rate instead of silently
 * switching itself off, which is the failure nobody would notice.
 */
export function parseBatchSize(raw: string | undefined): number | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export interface HealthSweepDeps {
  store: Store;
  gamesStore: GamesStore;
  gateTrigger: HealthGateTrigger;
  /** Resolves the engine ref to the commit it points at today. */
  githubClient: Pick<GitHubClient, 'getRefSha'>;
  /** The engine ref health runs check against. Matches run-gate.ts's `--health`. */
  engineRef?: string;
  batch?: number;
  now?: () => number;
  onError?: (slug: string, error: unknown) => void;
}

export interface HealthSweepResult {
  /** The engine commit everything was compared against; absent means we never found out. */
  head?: string;
  published: number;
  /** Last checked against the current engine already — nothing to do. */
  fresh: number;
  /** A check requested and still waiting for its verdict. */
  inFlight: number;
  /** Known broken and already nudged, inside the recheck cooldown. */
  cooling: number;
  /** Published at a version whose manifest could not be read. */
  unreadable: number;
  started: string[];
  /** Stale, but over this run's batch limit — picked up by the next run. */
  deferred: number;
}

function emptyResult(): HealthSweepResult {
  return { published: 0, fresh: 0, inFlight: 0, cooling: 0, unreadable: 0, started: [], deferred: 0 };
}

/**
 * Re-checks the published shelf against today's engine, a few games at a time.
 *
 * Fails closed on the one input it cannot do without: if the engine head does not resolve,
 * every game looks stale, and the sweep would start a run for the whole shelf on the
 * strength of a failed API call. Starting nothing is the only safe answer to "we don't
 * know where the engine is", and the next run asks again.
 */
export async function runHealthSweep(deps: HealthSweepDeps): Promise<HealthSweepResult> {
  const now = deps.now ?? Date.now;
  const engineRef = deps.engineRef ?? 'main';
  const batch = deps.batch ?? DEFAULT_BATCH;

  const head = await deps.githubClient.getRefSha(engineRef).catch(() => null);
  if (!head) return emptyResult();

  const publications = (await deps.store.listPublications()).filter((publication) => publication.state === 'published');
  const result: HealthSweepResult = { ...emptyResult(), head, published: publications.length };

  /** Stale games with the timestamp that decides who goes first. */
  const stale: Array<{ publication: PublicationRecord; lastCheckedAt: number }> = [];

  for (const publication of publications) {
    try {
      const check = publication.healthCheck;
      // Requested, no verdict yet, and still plausibly running: leave it alone rather
      // than stacking a second build on the same question.
      if (check && !check.verdictAt && now() - Date.parse(check.requestedAt) < IN_FLIGHT_TTL_MS) {
        result.inFlight += 1;
        continue;
      }
      if (check?.green === false && check.verdictAt && now() - Date.parse(check.verdictAt) < RED_RECHECK_COOLDOWN_MS) {
        result.cooling += 1;
        continue;
      }

      const manifest = await deps.gamesStore.getManifest(publication.slug, publication.currentVersion);
      if (!manifest) {
        result.unreadable += 1;
        continue;
      }

      // The last commit anything actually checked this version against. A health run is
      // the usual answer; the acceptance gate is the answer for a game published since
      // the engine last moved, and it checked the same thing against the same engine, so
      // re-running it would learn nothing.
      const lastCheckedRef = manifest.health?.engineRef ?? manifest.engineRef;
      if (lastCheckedRef === head) {
        result.fresh += 1;
        continue;
      }

      // Never checked sorts first (0), then oldest verdict. A game whose manifest carries
      // no timestamps at all is the most overdue thing on the shelf.
      const lastCheckedAt = Date.parse(manifest.health?.ranAt ?? manifest.createdAt) || 0;
      stale.push({ publication, lastCheckedAt });
    } catch (error) {
      result.unreadable += 1;
      deps.onError?.(publication.slug, error);
    }
  }

  stale.sort((a, b) => a.lastCheckedAt - b.lastCheckedAt);
  const picked = stale.slice(0, Math.max(0, batch));
  result.deferred = stale.length - picked.length;

  for (const { publication } of picked) {
    try {
      const start = await startHealthCheck(
        { store: deps.store, gamesStore: deps.gamesStore, gateTrigger: deps.gateTrigger, now },
        publication,
      );
      if (start.started) result.started.push(publication.slug);
      else result.unreadable += 1;
    } catch (error) {
      // One game that could not be started must not cost the rest of the batch theirs.
      deps.onError?.(publication.slug, error);
    }
  }

  return result;
}

export interface HealthSweepRoutesOptions {
  store?: Store;
  gamesStore?: GamesStore;
  gateTrigger?: HealthGateTrigger;
  githubClient?: Pick<GitHubClient, 'getRefSha'>;
  internalAuthVerifier: InternalAuthVerifier;
  engineRef?: string;
  batch?: number;
  now?: () => number;
}

export async function registerHealthSweepRoutes(
  app: FastifyInstance,
  options: HealthSweepRoutesOptions,
): Promise<void> {
  // Cloud Scheduler POSTs here with an OIDC token, exactly as the other sweeps do; the
  // rate ceiling is a runaway guard, not the access control. Daily is the intended
  // cadence — the shelf only goes stale when the engine moves — so the ceiling is low.
  app.post(
    '/api/internal/health-sweep',
    { config: { rateLimit: { max: 12, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!(await options.internalAuthVerifier.verify(request.headers.authorization))) {
        return reply.status(401).send({ error: 'unauthorized' });
      }
      const { store, gamesStore, gateTrigger, githubClient } = options;
      if (!store || !gamesStore || !gateTrigger || !githubClient) {
        return reply.status(503).send({ error: 'health sweep is not configured' });
      }

      try {
        const result = await runHealthSweep({
          store,
          gamesStore,
          gateTrigger,
          githubClient,
          engineRef: options.engineRef,
          batch: options.batch,
          now: options.now,
          onError: (slug, error) => request.log.error({ err: error, slug }, 'health re-gate could not be started'),
        });
        // Error level when the engine head did not resolve: the sweep answered 200 and did
        // nothing, which is the correct behaviour and exactly the kind that goes unnoticed
        // for weeks. `deferred` is logged for the same reason — a bounded batch that never
        // catches up should be visible as a number rather than inferred from silence.
        const log = result.head ? request.log.info.bind(request.log) : request.log.error.bind(request.log);
        log(result, result.head ? 'health sweep complete' : 'health sweep skipped: engine head did not resolve');
        return reply.send(result);
      } catch (error) {
        request.log.error({ err: error }, 'health sweep failed');
        return reply.status(500).send({ error: 'health sweep failed' });
      }
    },
  );
}
