import type { AgentTaskState } from '../../creation/agent-state.js';
import type { SeedFiles } from '../../agent-surface/agent-backend.js';
import type { BuilderKind } from '../../creation/builder.js';
import type { JobState, JobTransition } from '../../creation/job-state.js';
import type { SubmissionStatus } from '../../platform/submission-status.js';
import type { AgentEndedBy, BuilderHandoff } from './rounds.js';
import type { JobCostEntry, JobSeedOutcome } from './dispatch.js';

export interface SubmissionRecord {
  jobId: number;
  ownerUid: string;
  createdAt: string;
  title: string;
  /**
   * The game's permanent address: its directory on the agent's branch, its `/play/`
   * link, and how the studio names it instead of the capability-granting status token.
   *
   * Minted from the confirmed title when the submission is created, so a game has this
   * before any agent has seen it. Optional only for records that predate that, and for
   * the crash window between writing a record and setting its slug — both of which the
   * operator backfill exists to clear. Treat a missing slug as a straggler to be fixed,
   * not a state to design around.
   */
  slug?: string;
  // Latest candidate version delivered to the games store.
  // Kept here so the preview never lists the bucket per poll.
  deliveredVersion?: string;
  /**
   * Latest Studio-playable delivery (preview or publish). Preview-only rounds update
   * this without setting {@link deliveredVersion}, so control.delivered / publication
   * reconciliation still wait for a sealed publish delivery.
   */
  previewVersion?: string;
  // The kit engine this round builds against, fixed by its first get_kit.
  // Dropped when the round closes; replaced on kit_outdated or lost retention.
  roundKitEngineRef?: string;
  /**
   * How many times this job has been sent back for finishing without delivering.
   *
   * Counted rather than inferred from the transition history, which is capped and drops
   * its oldest entries — a long job would quietly earn fresh nudges as the evidence of
   * the old ones aged out. Each nudge is a real agent session and a real premium
   * request, so the ceiling has to hold for the life of the job.
   */
  deliveryNudges?: number;
  /**
   * When we first observed the game published. Together with createdAt it is the
   * only record of how long a build actually took, which is what lets the status
   * page answer "how long will this take?" with a real number instead of a shrug.
   */
  publishedAt?: string;
  /**
   * Set when the creator abandoned the build. A terminal state of its own: the
   * issue and any open PR are closed, and the status page stops deriving from
   * GitHub entirely (an abandoned build must not read as "needs a tweak").
   */
  abandonedAt?: string;
  /**
   * When the creator turned on the shared link for this game's draft, if they have.
   *
   * A game is addressable at `/play/<slug>` from the moment it is submitted, but until
   * this is set only its creator may open it there. Absent means off, which is the
   * default: before it existed, any signed-in visitor who knew a slug could read any
   * unpublished game, which made every in-progress game unlisted rather than private and
   * gave the person making it no say in the matter.
   *
   * A timestamp rather than a flag because "when did this become shareable" is the
   * question worth being able to answer later; clearing it turns sharing back off.
   */
  draftSharedAt?: string;
  /**
   * How many clarifying questions the creator actually answered before this was
   * submitted — 0 when they skipped the QA panel or it had nothing to ask.
   *
   * Derived from the concept that reached the agent rather than reported by the
   * client, so it measures what the build was really given. It is what lets
   * "does answering questions produce a better game?" be asked at all: join it
   * to the slug's play telemetry (question 6) once enough clarified games exist.
   */
  clarificationCount?: number;
  /**
   * The status we last emitted a notification for. Drives transition detection
   * (only notify when the mapped event changes) and lets the sweep stop scanning
   * a submission once it reaches a terminal, already-notified state.
   */
  lastNotifiedStatus?: SubmissionStatus;
  // Indexed active flag; lets notify-sweep avoid full-collection scans.
  sweepActive?: boolean;
  /**
   * The last status actually derived from GitHub, recorded on every derivation.
   *
   * Distinct from `lastNotifiedStatus`, which only moves when a *notification* is
   * emitted — `queued` and `publishing` map to no event at all, and `in_review`
   * shares one with `building`, so a submission can sit at `lastNotifiedStatus:
   * 'building'` while it is really being play-tested. Fine for deciding whether to
   * ping someone; wrong for showing them what their game is doing.
   */
  lastStatus?: SubmissionStatus;
  /**
   * The language the creator submitted in. Told to the agent over the build channel
   * so it can write its progress updates in that language directly — which beats
   * machine-translating them afterwards, and costs us nothing.
   */
  locale?: string;
  /**
   * The job's own state, as opposed to one derived from GitHub on every read.
   *
   * `lastStatus` above records what a derivation *said*; this records what the job
   * *is*. The distinction is what makes an operator queue, cancellation, retries and
   * a real answer to "stuck or slow?" possible at all — none of which can be built on
   * a value that is recomputed from a third party's UI state each time it is asked for.
   */
  state?: JobState;
  /**
   * When the job entered {@link state}. The input to every duration question: time in
   * state, queue age, and whether silence has gone on long enough to be a stall.
   */
  stateSince?: string;
  /**
   * The state history, oldest first, so a build explains itself afterwards — the
   * difference between "this took 40 minutes" and "this took 40 minutes because it was
   * re-dispatched twice after gate failures".
   *
   * Capped at {@link MAX_JOB_TRANSITIONS}: a job accrues a dozen or so legitimately, and
   * the cap exists so that a reconciler bug flapping between two states cannot grow a
   * document until it hits Firestore's 1 MB limit and takes the submission down with it.
   */
  transitions?: JobTransition[];
  /**
   * The agent backend's own last reported state, kept so stall detection can prefer
   * what the agent says over what timestamps imply — an agent that reports it is
   * blocked on an answer needs no inference at all.
   */
  agentState?: AgentTaskState;
  /**
   * When the agent last said anything over the build channel.
   *
   * Denormalized from the events subcollection on purpose: judging whether a build has
   * gone quiet is the operator queue's main job, and reading the newest event for every
   * in-flight submission would turn one page load into a fan-out of subcollection
   * queries — the shape of read amplification this whole change exists to remove.
   */
  lastAgentSignalAt?: string;
  /**
   * When the agent called MCP `end` for this round. Surfaces stall `ended` and unlocks
   * self→platform handoff without waiting for the quiet window. Cleared when the agent
   * writes again or the round generation advances.
   */
  agentEndedAt?: string;
  agentEndedBy?: AgentEndedBy;
  /**
   * Latest MCP presence thought (closed vocabulary key + timestamp).
   *
   * Not a chat event — Studio flashes it as a short headline while the agent is
   * browsing the kit. Cleared when a real build event arrives or the round closes.
   */
  lastAgentPresence?: { key: string; at: string };
  /**
   * Which backend is building this job and where.
   *
   * `refs` accumulates because a revision round is a *new* task rather than a new session
   * on the old one, so a job that has been revised twice has three refs sharing one
   * workspace. The newest is the one to observe.
   */
  dispatch?: {
    backend: string;
    refs: string[];
    credentialRefs?: Record<string, string>;
    workspace?: string;
    /**
     * The disposable branch a seeded build started from, when it was seeded at all.
     *
     * Recorded so the branch is released with the job. Its presence is also the honest
     * record of *which* builds got a generated round 0 — seeding fails open, so a job
     * without this field is one that built from nothing, and any comparison of seeded
     * against unseeded builds has to read it rather than assume the flag was on.
     */
    seedWorkspace?: string;
  };
  /**
   * What this job has cost, one entry per thing that was billed.
   *
   * Recorded at the moment of spending rather than reconstructed later: a session that
   * was started is a session that is charged for whatever happens next, and by the time
   * a job is published the evidence of how many rounds it took has been overwritten by
   * the rounds themselves.
   */
  costs?: JobCostEntry[];
  /**
   * What the generated round 0 actually did, for the jobs that got one.
   *
   * The cost ledger already books what a seed *spent*; this books what it *achieved*,
   * which is a different question and was previously answerable only from Cloud Logging.
   * That gap is not academic: the first live seeded build generated a draft and then
   * failed to place it — a mis-scoped credential — and the only evidence was a log line
   * nobody was reading. Absent means the job was never seeded.
   *
   * Distinct from `seed`, which holds a self build's draft *files*: this is the record
   * of what a platform seed did, not the draft itself.
   */
  seedOutcome?: JobSeedOutcome;
  /**
   * Active build-channel token generation for this job.
   *
   * Round-scoped channel tokens HMAC over this value; closing a round bumps it
   * transactionally with the state transition (see {@link transitionClosesRound}), so a
   * copied token from an earlier round stops validating without a revocation list.
   * Absent only on legacy jobs that have not yet closed a round under this model —
   * those still accept the pre-generation token shape until the first close initializes
   * the field. New jobs start at `1`.
   */
  roundGeneration?: number;
  /**
   * Which builder owns the *current* round: the platform's coding agent, or the
   * creator's own. Absent on legacy jobs (= platform).
   */
  builder?: BuilderKind;
  /**
   * Last builder used on this game. The next round defaults to it so switching is an
   * explicit choice at a round boundary rather than a settings dig.
   */
  defaultBuilder?: BuilderKind;
  builderHandoff?: BuilderHandoff;
  /**
   * Generated round-0 draft stored on the job for a self build.
   *
   * Self builds never commit a seed branch — the files live here until an agent (or a
   * later read endpoint) consumes them. Cleared when a new round opens.
   */
  seed?: SeedFiles;
  /**
   * Whether a seed is still generating, ready, or will not arrive this round.
   * Distinct from {@link seed}: agents can race create_game → get_brief before files
   * land, so `pending` must not look like `unavailable`. Cleared with the seed.
   */
  seedStatus?: 'pending' | 'available' | 'unavailable';
  // Seed regenerations asked for; each is paid, so it is capped.
  seedRegenerations?: number;
  /**
   * How many sources deliveries this round has accepted. Self rounds cap this
   * (`SELF_BUILD_DELIVERY_CAP`); resets when a new round opens.
   */
  roundDeliveryCount?: number;
  // Typecheck preflight refusals this round (cap 2).
  roundTypecheckPreflightRefusals?: number;
  // Grouped diagnostics when accepting past that cap.
  roundTypecheckPreflightBypassErrors?: string;
  // When this round opened (ISO); used for ms-to-first-accept.
  roundStartedAt?: string;
  // Submit attempts this round (refusals + accepts).
  roundSubmitAttempts?: number;
  // Audio / symbol preflight refusals this round.
  roundPreflightRefusalsAudio?: number;
  roundPreflightRefusalsSymbols?: number;
  // Last `${version}:${status}` already logged for gate metrics.
  roundLastGateMetricKey?: string;
  /**
   * Creator concept text (sanitized), without the QA clarifications block.
   *
   * Persisted so GET /api/agent/build/brief can answer without re-reading a GitHub
   * issue — jobs no longer file one. Optional only on legacy records that predate
   * brief persistence.
   */
  spec?: string;
  /**
   * Answers from the CreatorQA clarifications block, already split into lines.
   * Empty when the creator skipped the panel or it had nothing to ask.
   */
  qa?: string[];
  // Set before the reaper's one retry of a job stuck queued.
  dispatchReaperAttemptedAt?: string;
  // True when `spec` is a machine-assembled brief, not creator words.
  specIsSystemGenerated?: boolean;
}

// A record stored before `gating` was retired can carry it.

// Nothing entered it deliberately, so `submitted` is where such a job sat.

// A record stored before the field was renamed still carries `issueNumber`
// instead of `jobId` — Firestore is schemaless, so the TS rename alone
// leaves every already-persisted document unreadable under the new name.
export function fromStoredSubmission(data: unknown): SubmissionRecord {
  const record = data as SubmissionRecord & { issueNumber?: number };
  // `gating` no longer typechecks as a JobState.

  // A record written before it was removed can still hold the string.
  const storedState: string | undefined = record.state;
  const state = storedState === 'gating' ? 'submitted' : record.state;
  const jobId = record.jobId ?? record.issueNumber;
  if (state === record.state && jobId === record.jobId) return record;
  return { ...record, state, jobId: jobId as number };
}
