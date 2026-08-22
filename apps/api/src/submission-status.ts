// Submission status derivation, extracted from submissions.ts so it can be shared
// by the on-demand status route AND the server-side notification sweep
// (docs/notifications-plan.md N1). This is a pure translation of GitHub state
// (issue → linked PR → published catalog) into our status vocabulary — no I/O of
// its own; callers pass an `isSlugPublished` probe.

import type { BuilderKind } from '@gamedevpl/contract';
import type { LinkedPullRequest } from './github-client.js';
import type { GateProgressLane } from './gate-progress.js';
import type { RecentBuild } from './recent-builds.js';
import type { JobStall, JobState } from './job-state.js';
import {
  BUILD_EVENT_KINDS,
  BUILD_STEPS,
  type BuildEventKind,
  type BuildStep,
  type SubmissionState,
} from '@gamedevpl/contract';

// Same seven values apps/web/src/submissionApi.ts calls SubmissionState.
export type SubmissionStatus = SubmissionState;

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
  // 'agent': relayed by the agent. 'studio': the chat agent. Else: the creator.
  origin?: 'agent' | 'studio';
  // Set once the running agent has collected this message from the inbox.
  delivered?: boolean;
  /**
   * Server-internal, and stripped before this reaches the wire — exactly like the pair on
   * BuildEvent. The translation is stored on the write and resolved against the reader's
   * locale per request, so the client is handed one sentence rather than a choice, and no
   * read ever calls a model to produce it.
   */
  textLocalized?: string;
  locale?: string;
}

// Marker the games-repo relay workflow matches on. Kept out of the rendered comment
// as an HTML comment so creators never see it. Lives here (rather than in
// submissions.ts) because both the writer and this reader need it.
export const CREATOR_FEEDBACK_MARKER = '<!-- gamedevpl:creator-feedback -->';

// Same values apps/web/src/submissionApi.ts calls BuildStep/BuildEventKind.
export { BUILD_STEPS, BUILD_EVENT_KINDS, type BuildStep, type BuildEventKind };

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
  /**
   * The job's own state, when we own one — a finer reading of the same moment than
   * `status`, which several distinct situations collapse into.
   *
   * `status` exists to place the build on a five-step timeline and cannot grow without
   * changing what every client draws, so `gating` and `building` arrive as one word and
   * the page says "writing code" while the checks are what is actually running. Worse at
   * the other end: `ready_for_review` is a delivered game waiting on us, and it renders
   * as "automated checks are making sure your game runs clean" for however long the wait
   * takes — a sentence that is not true when it is read, under a checklist saying every
   * task is done.
   *
   * So the coarse word keeps drawing the timeline, and this one lets the copy underneath
   * it describe the state the build is actually in. Absent for GitHub-derived
   * submissions, which have no job state to report; clients fall back to `status`.
   */
  phase?: JobState;
  slug?: string;
  /**
   * How this draft first landed in Studio, when that is not an ordinary agent build.
   * `'remix'` means save-as-yours from an in-player remix: preview-lane, no gate run,
   * never a catalog publication by itself. Studio uses this so gate-green copy
   * ("passed every check / waiting to go live") is not shown for a private remix.
   */
  draftOrigin?: 'remix';
  /**
   * Signal to attempt/poll Studio draft loading via `/api/submissions/:token/preview`.
   * Set for an open PR (slug on that branch) and for a native/self-build job once the
   * gate has stored `bundle.html` or `preview.html` for the delivered version.
   * Presence means "try loading," not a guarantee the route returns 200 on the same
   * tick — a brief 409 (`no preview available…`) can still land if the artifact was
   * just written or the store is catching up. Absent before the first storable draft.
   */
  preview?: { slug: string };
  previewGate?: { green: boolean; ranAt: string; report?: string; status?: 'kit_outdated' };
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
  /**
   * Last MCP/channel agent activity timestamp (heartbeat). Refreshed by real progress
   * and by presence pulses that intentionally do **not** create chat `events`. Used by
   * the Studio foot "updated ago" line when the transcript is quiet but the agent is
   * still browsing the kit.
   */
  lastAgentSignalAt?: string;
  /**
   * Short-lived presence thought for the Studio thread bar (closed vocabulary key).
   * Not a chat event — UI flashes it as a headline while the agent browses the kit.
   */
  lastAgentPresence?: { key: string; at: string };
  /** Mid-gate milestone; cleared on verdict. */
  gateProgress?: {
    lane: GateProgressLane;
    stage: string;
    index: number;
    total: number;
    at: string;
  };
  /**
   * Pictures of the game as it is now, newest first — the build log stops being a
   * wall of text. Same reasoning as `events`: kept outside `progress` so a build
   * with no pull request yet can still show something.
   */
  media?: BuildMediaItem[];
  /**
   * Playable builds pushed over the channel, newest first. A picture tells the creator
   * what the game looks like; these are the first thing that lets them find out whether
   * it is any fun, which is the only question they can really answer.
   */
  playable?: BuildPlayableItem[];
  /**
   * Why this build looks stuck, when it does — `awaiting_input`, `not_dispatched`,
   * `quiet`, `gate_not_started`, or `no_agent_yet` (self round waiting to connect).
   * Absent means it is progressing normally.
   *
   * The creator-experience review's open finding was that we could say "the agent has
   * been quiet" but never "the agent errored", so a stuck build and a slow one read
   * identically and the honest-looking answer was the discouraging one. This is the
   * field that distinguishes them, and it is deliberately a closed vocabulary rather
   * than a sentence: the UI renders its own translated copy for each case, so a Polish
   * creator gets Polish without a translation round-trip.
   */
  stall?: JobStall;
  /**
   * When the self agent called MCP `end`. Survives even if {@link stall} later becomes
   * `gate_not_started` (ops visibility) — Studio still offers platform handoff.
   */
  agentEndedAt?: string;
  /**
   * Who owns the *current* round (`platform` | `self`), when known. Studio uses this
   * (with {@link defaultBuilder}) instead of localStorage alone so another browser
   * still defaults to the game's last-used choice.
   */
  builder?: BuilderKind;
  /** Last builder used on this game — default for the next round-boundary choice. */
  defaultBuilder?: BuilderKind;
  builderHandoff?: {
    target: BuilderKind;
    requestedAt: string;
    acknowledgedAt?: string;
  };
  // Whether platform can be picked right now; absent means no opinion.
  platformBuilder?:
    { available: true } | { available: false; reason: 'coming_soon' | 'outage' | 'global_limit' | 'user_limit' };
  /**
   * Why this build is asking the creator to act, when it is. Set alongside `status`
   * because the public vocabulary projects both `failed` and a gate bounce onto
   * `needs_changes` — without this the page only shows the label, and a creator who
   * clicked "needs changes" never learns what happened or that feedback below starts
   * the next round. `reason` is the transition's machine-readable cause
   * (`task_failed`, `task_timed_out`, `gate_red`, …), a closed vocabulary like
   * `stall`: the UI renders its own translated copy, not this string.
   */
  failure?: { reason: string };
  /**
   * Who opened this improvement round, when it is one. Absent on first-time builds and
   * legacy jobs. Lets Studio distinguish a creator-started handoff from an agent-opened
   * round the creator did not initiate in the UI (BY-24).
   */
  openedBy?: 'creator' | 'agent';
  /**
   * Older jobs on the same slug (same owner), oldest first — so Studio can keep prior
   * rounds in the chat as collapsed history instead of dropping them when an improve
   * opens a new job. Absent when this is the only job, or the job has no slug yet.
   */
  priorRounds?: PriorRoundHistory[];
  /**
   * Read-only capability probe for the Code surface (creator-code-editing-execution-plan.md
   * CE-05): one field the web reads instead of re-deriving lock rules client-side.
   * Absent for a job with no bound slug yet (nothing to edit before one exists).
   */
  codeSurface?: {
    available: boolean;
    readOnly: boolean;
    reason?: 'agent_round' | 'killed';
  };
  // Last few delivered versions, newest first — what shipped, not the live round.
  recentBuilds?: RecentBuild[];
}

export type { RecentBuild } from './recent-builds.js';

/**
 * One finished (or superseded) build job's transcript, summarized for the tip job's
 * status page. Entries are oldest→newest and capped; the full per-job store remains
 * the source of truth.
 */
export interface PriorRoundHistory {
  /** Stable id for client dismiss keys — the job number as a string. */
  id: string;
  createdAt: string;
  /** Set when this job itself shipped. */
  publishedAt?: string;
  status: SubmissionStatus;
  entries: PriorRoundEntry[];
}

/** One row inside a {@link PriorRoundHistory} block. */
export interface PriorRoundEntry {
  kind: 'revision' | 'event';
  text: string;
  createdAt: string;
  // See CreatorRevision.origin — same meaning, on a 'revision' entry here.
  origin?: 'agent' | 'studio';
  step?: BuildStep;
}

/**
 * One playable build in progress. Unlike `BuildMediaItem` there is no `branch` variant:
 * a committed game is reachable through the draft link already, and this exists for the
 * window before any commit — from about a minute in, when the scaffold first compiles.
 */
export interface BuildPlayableItem {
  /** Stored preview id — the client builds the URL. */
  ref: string;
  slug?: string;
  /** Agent-authored caption, in the reader's language when one was supplied. */
  label?: string;
  createdAt?: string;
}

/**
 * One picture of a build in progress. Two sources, because they become available at
 * different times: `branch` media is committed by the agent (real capture output,
 * but only once it has run capture and pushed), while `channel` media is pushed
 * straight to us and can arrive in the first minutes.
 */
export interface BuildMediaItem {
  source: 'branch' | 'channel';
  /** Filename on the branch, or the stored shot id — the client builds the URL. */
  ref: string;
  /** Capture name ('opening') or agent-authored caption. */
  label?: string;
  createdAt?: string;
}

export interface SubmissionPublishedResponse extends SubmissionStatusResponseBase {
  status: 'published';
  slug: string;
}

export type SubmissionStatusResponse = SubmissionStatusResponseBase | SubmissionPublishedResponse;

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
