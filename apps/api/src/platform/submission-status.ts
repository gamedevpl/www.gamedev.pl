// Submission status derivation, extracted from submissions.ts so it can be shared
// by the on-demand status route AND the server-side notification sweep.
// The wire shapes now live in @gamedevpl/contract; what stays here is the
// derivation of GitHub state into our status vocabulary — no I/O of its own.

import type { LinkedPullRequest } from '../catalog/github-client.js';
import type { SubmissionState } from '@gamedevpl/contract';
import {
  BUILD_EVENT_KINDS,
  BUILD_STEPS,
  type BuildEventKind,
  type BuildProgress,
  type BuildStep,
  type ChecklistItem,
  type StoredBuildEvent,
  type StoredCreatorRevision,
  type SubmissionStatusResponse,
} from '@gamedevpl/contract';

// Same seven values apps/web/src/submissionApi.ts calls SubmissionState.
export type SubmissionStatus = SubmissionState;

// The stored forms carry a translation pair the wire never sees.
export type CreatorRevision = StoredCreatorRevision;
export type BuildEvent = StoredBuildEvent;

export type {
  BuildMediaItem,
  BuildPlayableItem,
  BuildProgress,
  ChecklistItem,
  PriorRoundEntry,
  PriorRoundHistory,
  SubmissionPublishedResponse,
  SubmissionStatusResponse,
  SubmissionStatusResponseBase,
} from '@gamedevpl/contract';

// Marker the games-repo relay workflow matches on, kept out of rendered copy.
export const CREATOR_FEEDBACK_MARKER = '<!-- gamedevpl:creator-feedback -->';

// Same values apps/web/src/submissionApi.ts calls BuildStep/BuildEventKind.
export { BUILD_STEPS, BUILD_EVENT_KINDS, type BuildStep, type BuildEventKind };

export type { RecentBuild } from '../delivery/recent-builds.js';

/**
 * Newest line of an agent progress journal. The file is a newest-first list, so we
 * take the first line that carries content, and strip the list bullet and any
 * leading timestamp the agent prefixed it with.
 */
export function parseProgressNote(raw: string | null): string | undefined {
  if (!raw) return undefined;

  for (const line of raw.split('\n')) {
    const withoutBullet = line.replace(/^\s*[-*]\s+/, '').trim();
    // Skip headings, blank lines and horizontal rules.
    if (!withoutBullet || withoutBullet.startsWith('#') || /^[-=_]{3,}$/.test(withoutBullet)) continue;

    const withoutTimestamp = withoutBullet.replace(/^\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?\s*[—–-]?\s*/, '');
    const text = sanitizeCreatorText(withoutTimestamp, { singleLine: true }).slice(0, 300);
    if (text) return text;
  }
  return undefined;
}

/**
 * How many QA answers the creator appended to a concept.
 *
 * The block is written by CreatorQA (`## Creator clarifications`, then one `- ` line
 * per answered question) — an English marker regardless of the creator's language, so
 * this does not need to know which locale asked the questions.
 *
 * Deliberately reads the *raw* concept: `sanitizeCreatorText` strips `#`, so by the
 * time the text is sanitized the heading is indistinguishable from a line the creator
 * typed themselves. Counting here measures what the creator actually answered, rather
 * than trusting a number the client could send.
 */
export function countCreatorClarifications(rawConcept: string): number {
  const marker = rawConcept.indexOf('## Creator clarifications');
  if (marker === -1) return 0;
  return rawConcept
    .slice(marker)
    .split('\n')
    .slice(1)
    .filter((line) => line.trimStart().startsWith('- ')).length;
}

export function sanitizeCreatorText(raw: string, options: { singleLine: boolean }): string {
  const withoutHtml = raw.replace(/<[^>]+>/g, ' ');
  const withoutMarkdownLinks = withoutHtml
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const normalized = withoutMarkdownLinks.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n').map((line) =>
    line
      .replace(/[`*_~>#]/g, '')
      .replace(/[^\S\n]+/g, ' ')
      .trim(),
  );
  const joined = options.singleLine ? lines.join(' ') : lines.join('\n');
  return joined
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim();
}

// The agent maintains a GitHub task list in the PR body (`- [ ]` / `- [x]`).
// Mine it as a plan-with-progress. Cap the count so a hostile/huge body can't
// bloat the response, and sanitize each label (it's untrusted, prompt-influenced
// text) even though the client also escapes on render.
const MAX_CHECKLIST_ITEMS = 30;
const MAX_COMMITS = 20;

function parseChecklist(body: string | undefined): ChecklistItem[] {
  if (!body) {
    return [];
  }

  const items: ChecklistItem[] = [];
  const pattern = /^[ \t]*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null && items.length < MAX_CHECKLIST_ITEMS) {
    const text = sanitizeCreatorText(match[2] ?? '', { singleLine: true });
    if (text) {
      items.push({ text, checked: match[1]?.toLowerCase() === 'x' });
    }
  }
  return items;
}

const MAX_REVISIONS = 20;
/** Cap on one change request, and therefore on a stored translation of one. */
export const MAX_REVISION_CHARS = 2000;

/**
 * Pulls the creator's change requests back out of the PR conversation. Each was
 * posted by us with the marker plus the creator's text in a ```text fence — the
 * games-repo relay workflow re-posts the same comment under a licensed identity to
 * wake the agent, so identical texts are deduped to one entry.
 */
export function parseCreatorRevisions(comments: LinkedPullRequest['comments']): CreatorRevision[] {
  const revisions: CreatorRevision[] = [];
  const seen = new Set<string>();

  for (const comment of comments ?? []) {
    if (!comment.body.includes(CREATOR_FEEDBACK_MARKER)) continue;

    // The creator's own words are the last fenced ```text block in the comment.
    const fences = [...comment.body.matchAll(/```text\n([\s\S]*?)```/g)];
    const raw = fences[fences.length - 1]?.[1];
    if (!raw) continue;

    const text = sanitizeCreatorText(raw, { singleLine: false }).slice(0, MAX_REVISION_CHARS);
    if (!text || seen.has(text)) continue;

    seen.add(text);
    revisions.push({ text, createdAt: comment.createdAt });
  }

  return revisions.slice(-MAX_REVISIONS);
}

function buildProgress(linkedPr: LinkedPullRequest): BuildProgress | undefined {
  if (!linkedPr.headRefOid) {
    return undefined;
  }

  const commits = (linkedPr.commits ?? []).slice(-MAX_COMMITS).map((commit) => ({
    message: sanitizeCreatorText(commit.message, { singleLine: true }),
    committedDate: commit.committedDate,
  }));

  return {
    headSha: linkedPr.headRefOid,
    commits,
    checklist: parseChecklist(linkedPr.body),
    revisions: parseCreatorRevisions(linkedPr.comments),
    checks: linkedPr.checksState ?? null,
  };
}

export function extractSlugFromChangedFiles(changedFiles: string[]): string | null {
  for (const path of changedFiles) {
    const matched = /^games\/([^/]+)\//.exec(path);
    if (matched?.[1]) {
      return matched[1];
    }
  }
  return null;
}

export async function deriveStatus(
  issueState: 'open' | 'closed',
  linkedPr: LinkedPullRequest | null,
  isSlugPublished: (slug: string) => Promise<boolean>,
): Promise<SubmissionStatusResponse> {
  if (!linkedPr) {
    return issueState === 'closed' ? { status: 'needs_changes' } : { status: 'queued' };
  }

  if (linkedPr.merged) {
    const slug = extractSlugFromChangedFiles(linkedPr.changedFiles);
    if (!slug) {
      return { status: 'publishing' };
    }

    const published = await isSlugPublished(slug);
    if (!published) {
      return { status: 'publishing', slug };
    }

    // The web app plays a published game through GET /api/games/:slug — same
    // origin, so the games repo itself never needs to be publicly reachable.
    return { status: 'published', slug };
  }

  if (linkedPr.state !== 'OPEN') {
    return issueState === 'closed' ? { status: 'needs_changes' } : { status: 'queued' };
  }

  // The PR is open and unmerged. If it already contains a game directory, the
  // creator can preview it from the branch — surface that so the UI can offer it.
  const slug = extractSlugFromChangedFiles(linkedPr.changedFiles);
  const preview = slug ? { preview: { slug } } : {};
  const progress = buildProgress(linkedPr);
  const progressField = progress ? { progress } : {};

  if (linkedPr.isDraft || linkedPr.titleHasWip) {
    return { status: 'building', ...preview, ...progressField };
  }

  return { status: 'in_review', ...preview, ...progressField };
}
