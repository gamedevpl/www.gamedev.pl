import type { BuildEventKind, BuildStep } from './build-event.js';
import type { BuilderKind } from './builder-kind.js';
import type { BuilderUnavailableReason } from './builder-availability.js';
import type { DeliveryMode } from './delivery-mode.js';
import type { GateProgress, GateProgressStage } from './gate-progress.js';
import type { JobStall, JobState } from './job-state.js';
import type { SubmissionState } from './submission-state.js';

// One task the agent parsed out of its own checklist.
export interface ChecklistItem {
  text: string;
  checked: boolean;
}

// A change request the creator sent from the status page.
export interface CreatorRevision {
  text: string;
  createdAt: string;
  // 'agent' relayed it, 'studio' is the chat agent, else the creator.
  origin?: 'agent' | 'studio';
  // Set once the running agent collected this from the inbox.
  delivered?: boolean;
}

// Stored form; the translation pair is stripped before the wire.
export interface StoredCreatorRevision extends CreatorRevision {
  textLocalized?: string;
  locale?: string;
}

// One update the agent pushed over the build channel.
export interface BuildEvent {
  id: string;
  kind: BuildEventKind;
  step?: BuildStep;
  // Agent-authored, prompt-influenced text — render escaped.
  text: string;
  // The agent's own count of where it is.
  progress?: { done: number; total: number };
  createdAt: string;
}

// Stored form; the localized sentence is resolved per request.
export interface StoredBuildEvent extends BuildEvent {
  textLocalized?: string;
  locale?: string;
}

// Live signals mined from an open pull request.
export interface BuildProgress {
  // Head commit SHA; changes whenever the agent pushes.
  headSha: string;
  // Recent commit subject lines, oldest to newest.
  commits: Array<{ message: string; committedDate: string }>;
  checklist: ChecklistItem[];
  revisions: CreatorRevision[];
  // FAILURE separates a build in trouble from a slow one.
  checks?: 'SUCCESS' | 'FAILURE' | 'PENDING' | null;
  // Newest line of the agent's own progress journal.
  note?: string;
}

// One picture of a build in progress.
export interface BuildMediaItem {
  // 'branch' was committed by the agent, 'channel' pushed straight to us.
  source: 'branch' | 'channel';
  ref: string;
  // Capture name or agent-authored caption — render escaped.
  label?: string;
  createdAt?: string;
}

// One playable build, pushed before any commit exists.
export interface BuildPlayableItem {
  ref: string;
  slug?: string;
  // Agent-authored caption, in the reader's language when supplied.
  label?: string;
  createdAt?: string;
}

// One row inside a prior round's collapsed history block.
export interface PriorRoundEntry {
  kind: 'revision' | 'event';
  // Untrusted text — render escaped.
  text: string;
  createdAt: string;
  origin?: 'agent' | 'studio';
  step?: BuildStep;
}

// One finished job's transcript, summarized for the tip job.
export interface PriorRoundHistory {
  // Stable client dismiss key — the job number as a string.
  id: string;
  createdAt: string;
  // Set when this job itself shipped.
  publishedAt?: string;
  status: SubmissionState;
  entries: PriorRoundEntry[];
}

// One delivered version, summarized for the Studio build rail.
export interface RecentBuild {
  version: string;
  createdAt: string;
  mode: DeliveryMode;
  // 'pending' until this version's own gate reports a verdict.
  verdict: 'pending' | 'green' | 'red';
  status?: 'kit_outdated';
  // Where a red run died, so the bar freezes there.
  failedStage?: GateProgressStage;
  failedIndex?: number;
  // Lane stage count: preview six, publish twelve.
  total?: number;
  // Delivery to verdict in ms; the ETA median uses these.
  finishedInMs?: number;
  // Who authored this delivery: agent, owner, or mixed.
  authorship?: 'agent' | 'owner' | 'mixed';
  // Summary or note describing what changed in this build.
  summary?: string;
  // Number of source files in this build.
  fileCount?: number;
  // Producing job, used to attach the changelog.
  issueNumber?: number;
}

// Whether platform can be picked now; absent means no opinion.
export type PlatformBuilderAvailability = { available: true } | { available: false; reason: BuilderUnavailableReason };

// What GET /api/submissions/:token reports about one build.
export interface SubmissionStatusResponseBase {
  status: SubmissionState;
  // Finer than status; absent for GitHub-derived submissions.
  phase?: JobState;
  // This round's own job id, distinct from slug-scoped `recentBuilds[0]`.
  issueNumber?: number;
  slug?: string;
  // 'remix' means a private save-as-yours fork that never gates.
  draftOrigin?: 'remix';
  // Signal to try loading a draft, not a 200 guarantee.
  preview?: { slug: string };
  previewGate?: { green: boolean; ranAt: string; report?: string; status?: 'kit_outdated' };
  progress?: BuildProgress;
  // Channel updates, newest first; arrive before any pull request.
  events?: BuildEvent[];
  // Last agent activity; advances even with no chat event.
  lastAgentSignalAt?: string;
  // Ambient presence thought — flashed, never a transcript row.
  lastAgentPresence?: { key: string; at: string };
  gateProgress?: GateProgress;
  // Pictures of the build, newest first.
  media?: BuildMediaItem[];
  // Playable builds pushed over the channel, newest first.
  playable?: BuildPlayableItem[];
  // Why the build looks stuck; absent means progressing normally.
  stall?: JobStall;
  // When the self agent called MCP end.
  agentEndedAt?: string;
  // Who owns the current round, when known.
  builder?: BuilderKind;
  // Last builder used here — default for the next round.
  defaultBuilder?: BuilderKind;
  builderHandoff?: {
    target: BuilderKind;
    requestedAt: string;
    acknowledgedAt?: string;
  };
  platformBuilder?: PlatformBuilderAvailability;
  // Machine-readable cause; render translated copy, never this string.
  failure?: { reason: string };
  // Who opened this improvement round, when it is one.
  openedBy?: 'creator' | 'agent';
  // Older jobs on the same slug, oldest first.
  priorRounds?: PriorRoundHistory[];
  // Read-only capability probe for the Code surface.
  codeSurface?: {
    available: boolean;
    readOnly: boolean;
    reason?: 'agent_round' | 'killed';
  };
  // Last few delivered versions, newest first.
  recentBuilds?: RecentBuild[];
  // Total number of recorded build versions for this game.
  totalBuildsCount?: number;
}

// A published build always carries its slug.
export interface SubmissionPublishedResponse extends SubmissionStatusResponseBase {
  status: 'published';
  slug: string;
}

export type SubmissionStatusResponse = SubmissionStatusResponseBase | SubmissionPublishedResponse;

// One of the creator's games from the mine listing.
export interface MySubmission {
  token: string;
  title: string;
  createdAt: string;
  // Last status derived server-side, refreshed by the sweep.
  lastKnownStatus: SubmissionState | null;
  // Present once known, so a card links straight through.
  slug: string | null;
  publishedAt?: string;
  // Catalog publish time when this row is an improvement tip.
  livePublishedAt?: string;
}

// One page of the creator's own games.
export interface MySubmissionsPage {
  submissions: MySubmission[];
  truncated: boolean;
  totalGames: number;
}
