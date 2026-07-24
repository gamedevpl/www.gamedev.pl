// Submission status derivation, extracted from submissions.ts so it can be shared
// by the on-demand status route AND the server-side notification sweep
// (docs/notifications-plan.md N1). This is a pure translation of GitHub state
// (issue → linked PR → published catalog) into our status vocabulary — no I/O of
// its own; callers pass an `isSlugPublished` probe.

import type { LinkedPullRequest } from './github-client.js';

export type SubmissionStatus =
  | 'queued'
  | 'building'
  | 'in_review'
  | 'publishing'
  | 'published'
  | 'needs_changes'
  // Terminal and creator-chosen: they stopped the build (issue + PR closed). Never
  // produced by deriveStatus — the store records it and the status route answers it.
  | 'abandoned';

export interface ChecklistItem {
  text: string;
  checked: boolean;
}

/**
 * A change request the creator sent from the status page. Relayed onto the PR as a
 * marked comment, and read back here so the status page can show the creator their
 * own revision history — without it, a sent revision vanishes into the build log.
 */
export interface CreatorRevision {
  text: string;
  createdAt: string;
}

// Marker the games-repo relay workflow matches on. Kept out of the rendered comment
// as an HTML comment so creators never see it. Lives here (rather than in
// submissions.ts) because both the writer and this reader need it.
export const CREATOR_FEEDBACK_MARKER = '<!-- gamedevpl:creator-feedback -->';

/**
 * The steps a game build actually moves through, as a closed set. This is the whole
 * i18n answer for progress reporting: the enum carries the *meaning* and is rendered
 * from our own translated copy, so a Polish creator reads correct Polish even when
 * the agent wrote its sentence in English and machine translation is off or failing.
 * The free-text sentence alongside it carries only flavour.
 */
export const BUILD_STEPS = [
  'planning',
  'art',
  'mechanics',
  'audio',
  'balancing',
  'fixing',
  'testing',
  'polishing',
] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];

/** What kind of moment this is — drives the icon and how loudly the UI says it. */
export const BUILD_EVENT_KINDS = ['step', 'milestone', 'asking', 'blocked', 'done'] as const;
export type BuildEventKind = (typeof BUILD_EVENT_KINDS)[number];

/**
 * One update pushed by the agent over the build channel, rather than inferred from
 * a commit it may not have pushed yet (docs/agent-live-channel-plan.md).
 *
 * `text` is agent-authored, prompt-influenced text: sanitized on the way in, escaped
 * on render. `textLocalized` is the same sentence already written in the creator's
 * language — when the agent supplies it we skip machine translation entirely.
 */
export interface BuildEvent {
  id: string;
  kind: BuildEventKind;
  step?: BuildStep;
  text: string;
  textLocalized?: string;
  /** Which language `textLocalized` is in. Without it, the field is unusable. */
  locale?: string;
  /** The agent's own count of where it is, when it knows. Drives a real progress bar. */
  progress?: { done: number; total: number };
  createdAt: string;
}

export interface BuildProgress {
  /**
   * Head commit SHA of the PR. Changes each time the agent pushes, so the client
   * can tell when there's fresh work and refresh the live preview.
   */
  headSha: string;
  /** Running build log — recent commit subject lines, oldest→newest. */
  commits: Array<{ message: string; committedDate: string }>;
  /** The agent's task checklist parsed from the PR body, in order. */
  checklist: ChecklistItem[];
  /** The creator's own change requests on this build, oldest→newest. */
  revisions: CreatorRevision[];
  /**
   * CI rollup on the head commit. 'FAILURE' is the one signal that distinguishes a
   * build in trouble from a build that is merely slow, so the UI can say which.
   */
  checks?: 'SUCCESS' | 'FAILURE' | 'PENDING' | null;
  /**
   * The agent's own "here's what I'm doing" line, from `games/<slug>/PROGRESS.md`
   * on its branch. Present only when the agent keeps that journal. Agent-authored,
   * prompt-influenced text — sanitized here, escaped on render.
   */
  note?: string;
}

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

export interface SubmissionStatusResponseBase {
  status: SubmissionStatus;
  slug?: string;
  /**
   * Present while an unmerged PR is open (building/in_review): the creator can
   * play the in-progress game straight from the PR branch, before the human
   * merge. `slug` is the game directory on that branch.
   */
  preview?: { slug: string };
  /**
   * Present while an unmerged PR is open: live signals mined from the PR (commits,
   * task checklist) so the UI can show the build taking shape. All fields are
   * agent-authored text influenced by the creator prompt — render escaped only.
   */
  progress?: BuildProgress;
  /**
   * Updates the agent pushed over the build channel, newest first. Deliberately
   * OUTSIDE `progress`: those fields all require an open PR, and the minutes before
   * the first PR exists are exactly when the creator is staring at an empty page.
   */
  events?: BuildEvent[];
}

export interface SubmissionPublishedResponse extends SubmissionStatusResponseBase {
  status: 'published';
  slug: string;
}

export type SubmissionStatusResponse = SubmissionStatusResponseBase | SubmissionPublishedResponse;

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
const MAX_REVISION_CHARS = 2000;

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
