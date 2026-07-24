// Submission status derivation, extracted from submissions.ts so it can be shared
// by the on-demand status route AND the server-side notification sweep
// (docs/notifications-plan.md N1). This is a pure translation of GitHub state
// (issue → linked PR → published catalog) into our status vocabulary — no I/O of
// its own; callers pass an `isSlugPublished` probe.

import type { LinkedPullRequest } from './github-client.js';

export type SubmissionStatus = 'queued' | 'building' | 'in_review' | 'publishing' | 'published' | 'needs_changes';

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
