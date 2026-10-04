import {
  selectTelemetryCohort,
  type GamePerformanceQuery,
  type GamePerformanceResponse,
  type ReadGamePerformance,
} from '@gamedevpl/contract';
import { summarizeFramePerformance } from '../platform/frame-performance.js';
import { recentPartitions } from '../platform/telemetry-health.js';
import { ownsGame, resolveGameAccess } from '../platform/game-access-resolve.js';
import { isPublished } from '../platform/publication-state.js';
import type { PublishedSlugGate } from '../catalog/published-slugs.js';
import { rememberBounded } from '../platform/bounded-map.js';
import type { Store, TelemetryEvent } from '../platform/store.js';
import { scanOwnedSlugs, spendStudioHealthScan, StudioHealthBudgetError } from './studio-health-scan.js';

export const PERFORMANCE_CACHE_MS = 10 * 60_000;
export const MAX_PERFORMANCE_GROUPS = 100;
const MAX_CACHED_WINDOWS = 50;

type Window = { events: TelemetryEvent[]; days: string[]; truncated: boolean; at: number };
const caches = new WeakMap<Store, Map<string, Window>>();
const inflight = new WeakMap<Store, Map<string, Promise<Window>>>();
const sessionKey = (event: TelemetryEvent) => `${event.slug}/${event.sessionId}`;

function formatReport(window: Window, query: GamePerformanceQuery): GamePerformanceResponse {
  const opens = window.events.filter((event) => event.type === 'game_opened');
  const matching = new Set(opens.filter((e) => e.artifactVersion === query.artifactVersion).map(sessionKey));
  const events = query.artifactVersion
    ? window.events.filter((event) => matching.has(sessionKey(event)))
    : window.events;
  const report = summarizeFramePerformance(events, query.performanceReviewers);
  const selected = selectTelemetryCohort(events, sessionKey, query.performanceReviewers, 'event');
  const beforeAgentFilter = selectTelemetryCohort(
    events.map((event) => ({ ...event, agentMode: false })),
    sessionKey,
    query.performanceReviewers,
    'event',
  );
  const versions = [
    ...new Set(
      [...opens]
        .sort((a, b) => b.at.localeCompare(a.at))
        .flatMap((e) => (e.artifactVersion ? [e.artifactVersion] : [])),
    ),
  ];
  const groups = [...report.groups].sort((a, b) => b.observedMs - a.observedMs);
  return {
    slug: query.slug,
    requestedDays: query.days,
    days: window.days,
    performanceReviewers: query.performanceReviewers,
    artifactVersion: query.artifactVersion ?? null,
    availableVersions: versions.slice(0, 100),
    versionsTruncated: versions.length > 100,
    measuredAt: new Date(window.at).toISOString(),
    freshUntil: new Date(window.at + PERFORMANCE_CACHE_MS).toISOString(),
    status: beforeAgentFilter.length === 0 ? 'no_traffic' : report.measuredSessions ? 'measured' : 'no_valid_windows',
    scanTruncated: window.truncated,
    groupsTruncated: report.truncated || groups.length > MAX_PERFORMANCE_GROUPS,
    totalGroups: groups.length,
    measuredSessions: report.measuredSessions,
    unmeasuredSessions: report.unmeasuredSessions,
    invalidWindows: selected.filter((e) => e.type === 'alive' && e.performance && !e.performance.valid).length,
    agentEventsExcluded: beforeAgentFilter.length - selected.length,
    aliveWithoutPerformance: selected.filter((e) => e.type === 'alive' && !e.performance).length,
    groups: groups.slice(0, MAX_PERFORMANCE_GROUPS),
  };
}

async function isLiveGame(store: Store, slug: string, repoGate: PublishedSlugGate | null): Promise<boolean> {
  const publication = await store.getPublication(slug);
  return publication ? isPublished(publication) : ((await repoGate?.isPublished(slug)) ?? false);
}

export function createCreatorPerformanceReader(
  store: Store,
  now: () => number = Date.now,
  repoGate: PublishedSlugGate | null = null,
): ReadGamePerformance {
  if (!caches.has(store)) caches.set(store, new Map());
  if (!inflight.has(store)) inflight.set(store, new Map());
  return async (uid, query) => {
    const user = await store.getUser(uid);
    if (!user || user.tier === 'blocked') return { ok: false, code: 'not_owner' };
    const access = await resolveGameAccess(store, query.slug, now);
    if (!ownsGame(access, uid)) return { ok: false, code: 'not_owner' };
    const days = recentPartitions(query.days, now());
    const key = [uid, query.slug, access.accessRevision, days.join(',')].join('|');
    const cache = caches.get(store)!;
    const running = inflight.get(store)!;
    if (!(await isLiveGame(store, query.slug, repoGate))) {
      cache.delete(key);
      return { ok: false, code: 'not_published' };
    }
    let window = cache.get(key);
    let pending: Promise<Window> | undefined;
    try {
      if (!window || window.at + PERFORMANCE_CACHE_MS <= now()) {
        pending = running.get(key);
        if (!pending) {
          pending = (async () => {
            await spendStudioHealthScan(store, uid, now());
            const scanned = await scanOwnedSlugs(store, [query.slug], days);
            return { events: scanned.events, days: scanned.scanned, truncated: scanned.truncated, at: now() };
          })();
          running.set(key, pending);
        }
        window = await pending;
      }
      const latest = await resolveGameAccess(store, query.slug, now);
      if (!ownsGame(latest, uid) || latest.accessRevision !== access.accessRevision) {
        cache.delete(key);
        return { ok: false, code: 'not_owner' };
      }
      if (!(await isLiveGame(store, query.slug, repoGate))) {
        cache.delete(key);
        return { ok: false, code: 'not_published' };
      }
      rememberBounded(cache, key, window, MAX_CACHED_WINDOWS);
      return { ok: true, report: formatReport(window, query) };
    } catch (error) {
      if (error instanceof StudioHealthBudgetError)
        return { ok: false, code: 'rate_limited', retryAfterSeconds: error.retryAfterSeconds };
      throw error;
    } finally {
      if (pending && running.get(key) === pending) running.delete(key);
    }
  };
}
