import type { BuildEvent, BuildEventKind, BuildMediaItem, BuildProgress, BuildStep } from '../../submissionApi.js';

export type PendingRevision = { text: string; at: number };

export type ActivityEntry = {
  // 'studio': the agent's own chat turn, a third voice.
  kind: 'commit' | 'revision' | 'event' | 'media' | 'studio';
  text: string;
  at: number;
  // Sent from this tab but not yet echoed back by the API.
  pending?: boolean;
  // For agent events: the step it reported, rendered from our own translations.
  step?: BuildStep;
  eventKind?: BuildEventKind;
  // Set when an agent wrote the revision on the creator's behalf.
  relayed?: boolean;
  // Whether the agent has picked this message up from its inbox yet.
  delivered?: boolean;
  // Pictures shown as thumbnails on this row, expandable to full size.
  media?: BuildMediaItem[];
};

// Places the build's pictures on the timeline, dated to their moment.
export function mediaEntries(media: BuildMediaItem[], commitTime: number, caption: string): ActivityEntry[] {
  const branch = media.filter((item) => item.source === 'branch');
  const entries: ActivityEntry[] =
    branch.length > 0 ? [{ kind: 'media', text: caption, at: commitTime, media: branch }] : [];

  for (const shot of media) {
    if (shot.source === 'branch') continue;
    entries.push({
      kind: 'media',
      text: shot.label ?? caption,
      at: shot.createdAt ? Date.parse(shot.createdAt) : commitTime,
      media: [shot],
    });
  }
  return entries;
}

export function buildActivityFeed(
  progress: BuildProgress | undefined,
  events: BuildEvent[],
  pendingRevisions: PendingRevision[],
  media: BuildMediaItem[],
  mediaCaption: string,
): ActivityEntry[] {
  // Branch captures date to the newest commit, else "now".
  const newestCommit = (progress?.commits ?? [])
    .map((commit) => Date.parse(commit.committedDate))
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0];

  const entries: ActivityEntry[] = [
    ...mediaEntries(media, newestCommit ?? Date.now(), mediaCaption),
    ...events.map((event) => ({
      kind: 'event' as const,
      text: event.text,
      at: Date.parse(event.createdAt),
      step: event.step,
      eventKind: event.kind,
    })),
    ...(progress?.commits ?? []).map((commit) => ({
      kind: 'commit' as const,
      text: commit.message,
      at: Date.parse(commit.committedDate),
    })),
    ...(progress?.revisions ?? []).map((revision) =>
      revision.origin === 'studio'
        ? { kind: 'studio' as const, text: revision.text, at: Date.parse(revision.createdAt) }
        : {
            kind: 'revision' as const,
            text: revision.text,
            at: Date.parse(revision.createdAt),
            delivered: revision.delivered,
            ...(revision.origin === 'agent' ? { relayed: true } : {}),
          },
    ),
  ];

  // A revision the API has already echoed back must not appear twice.
  const known = new Set((progress?.revisions ?? []).map((revision) => revision.text));
  for (const pending of pendingRevisions) {
    if (!known.has(pending.text)) {
      entries.push({ kind: 'revision', text: pending.text, at: pending.at, pending: true });
    }
  }

  // Oldest first — newest sits closest to the reply box.
  return entries.filter((entry) => Number.isFinite(entry.at)).sort((a, b) => a.at - b.at);
}
