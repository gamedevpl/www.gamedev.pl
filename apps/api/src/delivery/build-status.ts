import type { BuilderKind } from '@gamedevpl/contract';
import { stripPlaytestContext } from './build-transcript.js';
import { detectStall, toSubmissionStatus } from '../creation/job-state.js';
import { hydrateRecentBuildSummaries } from './build-changelog.js';
import { isStudioOrigin } from '../platform/store.js';
import type { ManagedAvailabilityGate } from '../agent-surface/managed-availability.js';
import type { GamesStore } from './games-store.js';
import type {
  BuildEvent,
  BuildMediaItem,
  BuildPlayableItem,
  CreatorRevision,
  PriorRoundEntry,
  PriorRoundHistory,
  SubmissionStatusResponse,
} from '../platform/submission-status.js';
import type {
  BuildPreviewSummary,
  BuildShotSummary,
  CreatorMessageOrigin,
  Store,
  SubmissionRecord,
} from '../platform/store.js';

// 'studio_ack' displays exactly like 'studio' — only the backend tells them apart.
export function revisionOriginOf(message: { origin?: CreatorMessageOrigin }): 'agent' | 'studio' | undefined {
  if (message.origin === 'agent') return 'agent';
  if (isStudioOrigin(message.origin)) return 'studio';
  return undefined;
}

export interface BuildStatusOptions {
  store?: Store;
  gamesStore?: GamesStore;
  now: () => number;
  managedAvailabilityGate?: ManagedAvailabilityGate | null;
  // N1: injected so this module has no value-level agent-surface import.
  isPresenceEventText: (text: string, createdAt?: string) => boolean;
}

export interface BuildStatusAssembler {
  attachBuildEvents(status: SubmissionStatusResponse, jobId: number, locale: string): Promise<SubmissionStatusResponse>;
  // Drops the cached channel events for a job that just received one.
  invalidateEvents(jobId: number): void;
}

function builderOf(record: SubmissionRecord | null | undefined): BuilderKind {
  return record?.builder ?? record?.defaultBuilder ?? 'platform';
}

// Assembles a status response's channel events, media, and prior-round history.
export function createBuildStatusAssembler(options: BuildStatusOptions): BuildStatusAssembler {
  const { store, gamesStore, now, managedAvailabilityGate, isPresenceEventText } = options;

  // Its own short cache, not the 60s status cache.
  const eventsCacheTtlMs = 5_000;
  const maxEventsShown = 20;
  const eventsCache = new Map<number, { expiresAt: number; value: BuildEvent[] }>();

  async function loadBuildEvents(jobId: number): Promise<BuildEvent[]> {
    if (!store) return [];
    const currentTime = now();
    const cached = eventsCache.get(jobId);
    if (cached && cached.expiresAt > currentTime) {
      return cached.value;
    }
    const value = await store.listBuildEvents(jobId, { limit: maxEventsShown });
    eventsCache.set(jobId, { value, expiresAt: currentTime + eventsCacheTtlMs });
    return value;
  }

  // The channel prunes on write; only a little history is ever wanted.
  const maxPreviewsShown = 4;
  const previewsCache = new Map<number, { expiresAt: number; value: BuildPreviewSummary[] }>();

  async function loadBuildPreviews(jobId: number): Promise<BuildPreviewSummary[]> {
    if (!store) return [];
    const currentTime = now();
    const cached = previewsCache.get(jobId);
    if (cached && cached.expiresAt > currentTime) {
      return cached.value;
    }
    const value = await store.listBuildPreviews(jobId, { limit: maxPreviewsShown });
    previewsCache.set(jobId, { value, expiresAt: currentTime + eventsCacheTtlMs });
    return value;
  }

  const maxShotsShown = 12;
  const shotsCache = new Map<number, { expiresAt: number; value: BuildShotSummary[] }>();

  async function loadBuildShots(jobId: number): Promise<BuildShotSummary[]> {
    if (!store) return [];
    const currentTime = now();
    const cached = shotsCache.get(jobId);
    if (cached && cached.expiresAt > currentTime) {
      return cached.value;
    }
    const value = await store.listBuildShots(jobId, { limit: maxShotsShown });
    shotsCache.set(jobId, { value, expiresAt: currentTime + eventsCacheTtlMs });
    return value;
  }

  // Pictures of this build: the screenshots the agent pushed over the channel.
  async function buildMedia(jobId: number, locale: string): Promise<BuildMediaItem[]> {
    return [
      ...(await loadBuildShots(jobId)).map((shot): BuildMediaItem => {
        // Reader's own language when the agent sent one, else English.
        const caption = shot.locale === locale && shot.labelLocalized ? shot.labelLocalized : shot.label;
        return {
          source: 'channel',
          ref: shot.id,
          ...(caption ? { label: caption } : {}),
          createdAt: shot.createdAt,
        };
      }),
    ];
  }

  // Playable builds pushed over the channel, newest first.
  async function buildPlayables(jobId: number, locale: string): Promise<BuildPlayableItem[]> {
    return (await loadBuildPreviews(jobId)).map((preview): BuildPlayableItem => {
      const caption = preview.locale === locale && preview.labelLocalized ? preview.labelLocalized : preview.label;
      return {
        ref: preview.id,
        ...(preview.slug ? { slug: preview.slug } : {}),
        ...(caption ? { label: caption } : {}),
        ...(preview.origin ? { origin: preview.origin } : {}),
        createdAt: preview.createdAt,
      };
    });
  }

  // Pure: 3s-polled, picks only between strings already stored.
  function localizeRevisions(revisions: CreatorRevision[], locale: string): CreatorRevision[] {
    return revisions.map((revision) => {
      const text = revision.locale === locale && revision.textLocalized ? revision.textLocalized : revision.text;
      const resolved: CreatorRevision = { ...revision, text };
      delete resolved.textLocalized;
      delete resolved.locale;
      return resolved;
    });
  }

  function localizeEvents(events: BuildEvent[], locale: string): BuildEvent[] {
    return events.map((event) => {
      const text = event.locale === locale && event.textLocalized ? event.textLocalized : event.text;
      // The wire carries one resolved sentence — the client never has to pick.
      const resolved: BuildEvent = { ...event, text };
      delete resolved.textLocalized;
      delete resolved.locale;
      return resolved;
    });
  }

  // Short cache: siblings rarely gain messages between polls.
  const priorRoundsCacheTtlMs = 30_000;
  const maxPriorRounds = 6;
  const maxPriorEntriesPerRound = 10;
  const maxCachedPriorRounds = 100;
  const priorRoundsCache = new Map<string, { expiresAt: number; value: PriorRoundHistory[] }>();

  function rememberPriorRounds(cacheKey: string, entry: { expiresAt: number; value: PriorRoundHistory[] }): void {
    // Drop expired keys first — a TTL alone leaks on a busy instance.
    const nowMs = entry.expiresAt - priorRoundsCacheTtlMs;
    for (const [key, cached] of priorRoundsCache) {
      if (cached.expiresAt <= nowMs) priorRoundsCache.delete(key);
    }
    // Delete-before-set moves this key newest; drop oldest when full.
    priorRoundsCache.delete(cacheKey);
    if (priorRoundsCache.size >= maxCachedPriorRounds) {
      const oldestKey = priorRoundsCache.keys().next().value;
      if (oldestKey !== undefined) priorRoundsCache.delete(oldestKey);
    }
    priorRoundsCache.set(cacheKey, entry);
  }

  // Older jobs on the same slug and creator — capped transcripts only.
  async function loadPriorRounds(record: SubmissionRecord, locale: string): Promise<PriorRoundHistory[]> {
    if (!store || !record.slug) return [];
    const cacheKey = `${record.slug}:${record.jobId}:${locale}`;
    const cached = priorRoundsCache.get(cacheKey);
    const currentTime = now();
    if (cached && cached.expiresAt > currentTime) return cached.value;

    // Only jobs started before this one — no later rounds as "earlier".
    const siblings = (await store.listSubmissionsBySlug(record.slug))
      .filter(
        (sibling) =>
          sibling.jobId !== record.jobId &&
          sibling.ownerUid === record.ownerUid &&
          sibling.createdAt < record.createdAt,
      )
      .slice(0, maxPriorRounds)
      .reverse();

    const rounds = await Promise.all(
      siblings.map(async (sibling): Promise<PriorRoundHistory | null> => {
        const [messages, rawEvents] = await Promise.all([
          store!.listCreatorMessages(sibling.jobId, { limit: maxPriorEntriesPerRound }),
          store!.listBuildEvents(sibling.jobId, { limit: maxPriorEntriesPerRound }),
        ]);
        const events = rawEvents.filter((event) => !isPresenceEventText(event.text, event.createdAt));
        const revisionEntries: PriorRoundEntry[] = localizeRevisions(
          messages.map((message) => ({
            text: stripPlaytestContext(message.text),
            createdAt: message.createdAt,
            ...(revisionOriginOf(message) ? { origin: revisionOriginOf(message) } : {}),
            ...(message.textLocalized && message.locale
              ? { textLocalized: stripPlaytestContext(message.textLocalized), locale: message.locale }
              : {}),
          })),
          locale,
        ).map((revision) => ({
          kind: 'revision' as const,
          text: revision.text,
          createdAt: revision.createdAt,
          ...(revision.origin === 'agent' || revision.origin === 'studio' ? { origin: revision.origin } : {}),
        }));
        const eventEntries: PriorRoundEntry[] = localizeEvents(events, locale).map((event) => ({
          kind: 'event' as const,
          text: event.text,
          createdAt: event.createdAt,
          ...(event.step ? { step: event.step } : {}),
        }));
        const entries = [...revisionEntries, ...eventEntries]
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .slice(-maxPriorEntriesPerRound);
        if (entries.length === 0) return null;
        const state = sibling.state ?? 'queued';
        return {
          id: String(sibling.jobId),
          createdAt: sibling.createdAt,
          ...(sibling.publishedAt ? { publishedAt: sibling.publishedAt } : {}),
          status: sibling.abandonedAt ? 'abandoned' : toSubmissionStatus(state),
          entries,
        };
      }),
    );

    const value = rounds.filter((round): round is PriorRoundHistory => round !== null);
    rememberPriorRounds(cacheKey, { value, expiresAt: currentTime + priorRoundsCacheTtlMs });
    return value;
  }

  // What the agent sent directly, plus live heartbeat fields.
  async function attachBuildEvents(
    status: SubmissionStatusResponse,
    jobId: number,
    locale: string,
  ): Promise<SubmissionStatusResponse> {
    const [loadedEvents, media, playable, record] = await Promise.all([
      loadBuildEvents(jobId),
      buildMedia(jobId, locale),
      buildPlayables(jobId, locale),
      // Soft: a store blip must not 500 a cached status poll.
      store ? store.getSubmission(jobId).catch(() => null) : Promise.resolve(null),
    ]);
    // Drop leftover synthetic presence steps from before heartbeats stopped writing chat.
    const events = loadedEvents.filter((event) => !isPresenceEventText(event.text, event.createdAt));
    const next: SubmissionStatusResponse = {
      ...status,
      ...(events.length > 0 ? { events: localizeEvents(events, locale) } : {}),
      ...(media.length > 0 ? { media } : {}),
      ...(playable.length > 0 ? { playable } : {}),
      // Resolved here, not in nativeJobStatus, so the cache stays language-neutral.
      ...(status.progress
        ? { progress: { ...status.progress, revisions: localizeRevisions(status.progress.revisions, locale) } }
        : {}),
    };
    if (!record) return next;

    // Must clear stale keys too — a resumed agent drops agentEndedAt/stall.
    if (record.lastAgentSignalAt) next.lastAgentSignalAt = record.lastAgentSignalAt;
    else delete next.lastAgentSignalAt;
    if (record.lastAgentPresence) next.lastAgentPresence = record.lastAgentPresence;
    else delete next.lastAgentPresence;
    if (record.agentEndedAt) next.agentEndedAt = record.agentEndedAt;
    else delete next.agentEndedAt;
    if (managedAvailabilityGate) {
      next.platformBuilder = await managedAvailabilityGate.peek(
        record.ownerUid,
        new Date(now()).toISOString().slice(0, 10),
      );
    }

    const stall = detectStall({
      state: record.state ?? 'queued',
      stateSince: record.stateSince ?? record.createdAt,
      lastAgentSignalAt: record.lastAgentSignalAt,
      agentState: record.agentState,
      agentEndedAt: record.agentEndedAt,
      now: now(),
      builder: builderOf(record),
    });
    if (stall) next.stall = stall;
    else delete next.stall;

    // Gate milestones — refresh outside the 60s cache.
    const playableVersion = record.previewVersion ?? record.deliveredVersion;
    if (record.slug && playableVersion && gamesStore?.getManifest) {
      try {
        const manifest = await gamesStore.getManifest(record.slug, playableVersion);
        if (manifest?.gateProgress && !manifest.gate && !manifest.previewGate) {
          next.gateProgress = manifest.gateProgress;
        } else {
          delete next.gateProgress;
        }
      } catch {
        // Keep cached.
      }
    }

    // Soft: sibling history must not 500 the live thread poll.
    try {
      const priorRounds = await loadPriorRounds(record, locale);
      if (priorRounds.length > 0) next.priorRounds = priorRounds;
      else delete next.priorRounds;
    } catch {
      delete next.priorRounds;
    }

    if (next.recentBuilds && next.recentBuilds.length > 0) {
      try {
        next.recentBuilds = await hydrateRecentBuildSummaries({
          builds: next.recentBuilds,
          locale,
          loadEvents: async (id) => (id === jobId ? loadedEvents : loadBuildEvents(id)),
          isPresenceEventText,
        });
      } catch (error) {
        void error;
      }
    }

    return next;
  }

  function invalidateEvents(jobId: number): void {
    eventsCache.delete(jobId);
  }

  return { attachBuildEvents, invalidateEvents };
}
