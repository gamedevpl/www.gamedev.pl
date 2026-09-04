// Sentence changelog for a version, from the round's own events.

import type { RecentBuild } from '@gamedevpl/contract';

const CHANGELOG_KINDS = new Set(['done', 'step']);

export type ChangelogEvent = {
  kind: string;
  text: string;
  textLocalized?: string;
  locale?: string;
  createdAt: string;
};

// N1: injected so this module has no value-level agent-surface import.
export function isChangelogWorthy(
  event: ChangelogEvent,
  isPresenceEventText: (text: string, createdAt?: string) => boolean,
): boolean {
  if (!CHANGELOG_KINDS.has(event.kind)) return false;
  if (!event.text.trim()) return false;
  return !isPresenceEventText(event.text, event.createdAt);
}

export function resolveChangelogText(event: ChangelogEvent, locale?: string): string {
  const localized = event.textLocalized?.trim();
  if (locale && event.locale === locale && localized) return localized;
  return event.text.trim();
}

export function resolveBuildSummary(
  stored: string | undefined,
  event: ChangelogEvent | undefined,
  locale?: string,
): string | undefined {
  if (event && locale && event.locale === locale && event.textLocalized?.trim()) {
    return event.textLocalized.trim();
  }
  if (stored?.trim()) return stored.trim();
  if (event?.text.trim()) return event.text.trim();
  return undefined;
}

// Newest-first: prefer done, else the newest step.
export function pickChangelogEvent(
  createdAt: string,
  nextCreatedAt: string | undefined,
  events: readonly ChangelogEvent[],
  isPresenceEventText: (text: string, createdAt?: string) => boolean,
): ChangelogEvent | undefined {
  const start = Date.parse(createdAt);
  if (!Number.isFinite(start)) return undefined;
  const parsedEnd = nextCreatedAt ? Date.parse(nextCreatedAt) : Number.POSITIVE_INFINITY;
  const end = Number.isFinite(parsedEnd) ? parsedEnd : Number.POSITIVE_INFINITY;

  const inWindow: ChangelogEvent[] = [];
  const before: ChangelogEvent[] = [];
  for (const event of events) {
    if (!isChangelogWorthy(event, isPresenceEventText)) continue;
    const at = Date.parse(event.createdAt);
    if (!Number.isFinite(at)) continue;
    if (at >= start && at < end) inWindow.push(event);
    else if (at < start) before.push(event);
  }

  const preferDone = (list: ChangelogEvent[]): ChangelogEvent | undefined =>
    list.find((event) => event.kind === 'done') ?? list[0];
  return preferDone(inWindow) ?? preferDone(before);
}

export function pickLatestChangelogText(
  events: readonly ChangelogEvent[],
  isPresenceEventText: (text: string, createdAt?: string) => boolean,
  locale?: string,
): string | undefined {
  const event = events.find((item) => isChangelogWorthy(item, isPresenceEventText));
  return event ? resolveChangelogText(event, locale) : undefined;
}

export function applyChangelogSummaries(
  builds: RecentBuild[],
  eventsByIssue: Map<number, readonly ChangelogEvent[]>,
  isPresenceEventText: (text: string, createdAt?: string) => boolean,
  locale?: string,
): RecentBuild[] {
  const byIssue = new Map<number, RecentBuild[]>();
  for (const build of builds) {
    if (typeof build.jobId !== 'number') continue;
    const list = byIssue.get(build.jobId) ?? [];
    list.push(build);
    byIssue.set(build.jobId, list);
  }

  const resolved = new Map<string, string>();
  for (const [jobId, group] of byIssue) {
    const events = eventsByIssue.get(jobId) ?? [];
    const oldestFirst = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (let i = 0; i < oldestFirst.length; i++) {
      const build = oldestFirst[i]!;
      const event = pickChangelogEvent(build.createdAt, oldestFirst[i + 1]?.createdAt, events, isPresenceEventText);
      const text = resolveBuildSummary(build.summary, event, locale);
      if (text) resolved.set(build.version, text);
    }
  }

  return builds.map((build) => {
    const summary = resolved.get(build.version);
    if (!summary || summary === build.summary) return build;
    return { ...build, summary };
  });
}

export async function hydrateRecentBuildSummaries(input: {
  builds: RecentBuild[];
  locale?: string;
  loadEvents: (jobId: number) => Promise<readonly ChangelogEvent[]>;
  isPresenceEventText: (text: string, createdAt?: string) => boolean;
}): Promise<RecentBuild[]> {
  const ids = [
    ...new Set(input.builds.map((build) => build.jobId).filter((id): id is number => typeof id === 'number')),
  ];
  if (ids.length === 0) return input.builds;
  const entries = await Promise.all(ids.map(async (id) => [id, await input.loadEvents(id)] as const));
  return applyChangelogSummaries(input.builds, new Map(entries), input.isPresenceEventText, input.locale);
}
