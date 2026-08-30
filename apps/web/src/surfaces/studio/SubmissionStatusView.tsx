import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { latestAgentActivityAt } from '../../agentActivity.js';
import { BuilderModeBadge } from '../../BuilderModeBadge.js';
import { readStorageItem, writeStorageItem } from '../../core/persistence.js';
import type { BuilderUnavailableReason } from '../../BuilderChoice.js';
import { defaultBuilderFor, isBuilderKind, saveLastBuilder, type BuilderKind } from '../../builderKind.js';
import { GameTheater } from '../../GameTheater.js';
import { PixelIcon, type PixelIconName } from '../../PixelIcon.js';
import {
  abandonSubmission,
  getChannelPlayable,
  getSubmissionPreview,
  handoffToPlatform,
  handoffToSelf,
  submitFeedback,
  buildMediaUrl,
  type BuildEvent,
  type BuildMediaItem,
  type BuildEventKind,
  type BuildPlayableItem,
  type BuildProgress,
  type BuildStep,
  type PriorRoundHistory,
  type SubmissionApiError,
  type SubmissionPreview,
  type SubmissionStatus,
} from '../../submissionApi.js';
import { NAVIGATE_EVENT, statusPath, studioPath } from '../../core/router.js';
import { formatRelativeTime } from '../../relativeTime.js';
import { connectCardMode, selfComposerRoute, selfStatusCopy, shouldShowConnectCard } from '../../selfBuildCopy.js';
import { StudioConnectCard, SwitchToPlatformControl, SwitchToSelfControl } from './StudioConnectCard.js';
import { StudioPriorRounds } from './StudioPriorRounds.js';
import { submitImprovement } from '../../studioApi.js';
import { pollDelayMs } from './studioStatusPoll.js';
import { pokeStudioStatus, subscribeStudioStatus } from './studioStatusStore.js';
import { studioThreadContentScrollTop, studioThreadNearContentEnd } from './studioThreadScroll.js';
import { recordStudioStep, type StudioStepDetail } from '../../visitTelemetry.js';
import { toBase64PngList } from '../../attachmentImages.js';
import { SketchModal } from '../../SketchModal.js';
import { useClampToViewport } from '../../useClampToViewport.js';

type BuilderHandoffHandler = () => Promise<void | { pending?: boolean }> | void | { pending?: boolean };

type ComposerAttachment = { id: string; name: string; dataUrl: string };

const MAX_COMPOSER_ATTACHMENTS = 4;

function copyInputFromStatus(status: SubmissionStatus | null | undefined) {
  return {
    builder: status?.builder,
    stall: status?.stall,
    failureReason: status?.failure?.reason,
    phase: status?.phase,
    agentEndedAt: status?.agentEndedAt,
  };
}

/**
 * Whether the Studio connect card should be on screen for this status snapshot.
 * True for self rounds with no agent yet *or* a quiet agent (card resurfaced).
 */
function isAwaitingOwnAgent(status: SubmissionStatus | null | undefined): boolean {
  return shouldShowConnectCard(copyInputFromStatus(status));
}

/**
 * Whether the next message opens a new round (builder can be chosen) rather than
 * continuing the current one.
 */
function canChooseBuilder(status: SubmissionStatus | null | undefined): boolean {
  if (!status) return false;
  // Agent ended (MCP `end`) or quiet self round: offer the platform handoff (API bumps
  // round generation so the self agent's token dies — two agents must not write the same round).
  // `agentEndedAt` unlocks even when stall later becomes `gate_not_started` for ops.
  if (
    status.builder === 'self' &&
    (status.stall === 'ended' || status.stall === 'quiet' || Boolean(status.agentEndedAt))
  ) {
    return true;
  }
  if (isAwaitingOwnAgent(status)) return false;
  // Gate-red / kit_outdated keep the round open server-side (`builder_locked` on switch).
  // Offering a selector that can only 409 is worse than hiding it until the repair lands.
  const failureReason = status.failure?.reason;
  if (status.status === 'needs_changes' && (failureReason === 'gate_red' || failureReason === 'kit_outdated')) {
    return false;
  }
  return status.status === 'published' || status.status === 'needs_changes' || Boolean(status.failure);
}

function resolveDefaultBuilder(token: string, status: SubmissionStatus | null | undefined): BuilderKind {
  if (status?.defaultBuilder && isBuilderKind(status.defaultBuilder)) return status.defaultBuilder;
  if (status?.builder && isBuilderKind(status.builder)) return status.builder;
  return defaultBuilderFor(token);
}

const TERMINAL_STATUSES = new Set<SubmissionStatus['status']>(['published', 'needs_changes', 'abandoned']);
/** Statuses that halt the linear timeline rather than sitting on a step of it. */
const HALTED_STATUSES = new Set<SubmissionStatus['status']>(['needs_changes', 'abandoned']);
/** How long the compact composer's "Sent!" receipt stays up before clearing itself. */
export const SENT_RECEIPT_MS = 4500;

/**
 * Whether the thread-foot spinner should run — agent mid-work, not "waiting on us".
 *
 * Gate-green used to spin forever after the agent finished. Self `ended` /
 * `agentEndedAt` is handoff, not mid-build — except live `gateProgress`, which
 * means the platform check is still running after submit auto-end.
 */
function isAgentWorkActive(status: SubmissionStatus | null | undefined): boolean {
  if (!status) return false;
  if (TERMINAL_STATUSES.has(status.status)) return false;
  if (isAwaitingOwnAgent(status)) return false;
  if (status.status === 'in_review' || status.phase === 'ready_for_review') return false;
  if (status.gateProgress) return true;
  if (status.stall === 'ended' || status.stall === 'quiet' || Boolean(status.agentEndedAt)) return false;
  return true;
}

// True even once the agent has ended.
function canOfferSelfHandoff(status: SubmissionStatus | null | undefined): boolean {
  if (!status || status.builder === 'self') return false;
  if (status.status === 'publishing') return false;
  if (status.status === 'in_review' || status.phase === 'ready_for_review') return false;
  if (TERMINAL_STATUSES.has(status.status)) return false;
  if (status.builderHandoff) return false;
  return true;
}

const STATUS_ICONS: Record<SubmissionStatus['status'], PixelIconName> = {
  queued: 'clock',
  building: 'wrench',
  in_review: 'eye',
  publishing: 'rocket',
  published: 'star',
  needs_changes: 'pencil',
  abandoned: 'trash',
};

// The linear happy path the timeline visualizes. needs_changes branches off it,
// so it's handled as a separate "halted" state rather than a timeline position.
const TIMELINE_STEPS: SubmissionStatus['status'][] = ['queued', 'building', 'in_review', 'publishing', 'published'];

/** How long a presence thought stays as the thread-bar headline before falling back. */
const PRESENCE_THOUGHT_MS = 90_000;

/**
 * Ambient MCP presence for the live working turn — a thought headline on the
 * pulsing last transcript row, not a durable chat bubble.
 * Fresh for {@link PRESENCE_THOUGHT_MS}; cleared server-side when real progress arrives.
 */
function presenceThought(
  status: SubmissionStatus | null,
  nowMs: number = Date.now(),
): { key: string; at: number } | null {
  const presence = status?.lastAgentPresence;
  if (!presence?.key) return null;
  const at = Date.parse(presence.at);
  if (!Number.isFinite(at) || nowMs - at > PRESENCE_THOUGHT_MS) return null;
  return { key: presence.key, at };
}

/**
 * "Live · updated 3 minutes ago" — the build's pulse.
 *
 * This replaced a stopwatch counting from submission, which was the page's most
 * prominent number and its least informative: on a build that had delivered, passed
 * its checks and been waiting to go live for hours, it read "In progress for 8h 00m"
 * directly above a checklist saying every task was done. Time since the last sign of
 * life answers the question the stopwatch was being read for — is this thing moving? —
 * and keeps answering it correctly once the agent has finished.
 *
 * Re-renders on a slow timer because the text is a relative time that goes stale on
 * its own; the minute granularity is why 30s is often enough and 1s would be waste.
 */
function BuildHeartbeat({ at }: { at: number }) {
  const { t, i18n } = useTranslation();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="status-heartbeat">
      {t('statusView.updatedAgo', { time: formatRelativeTime(at, i18n.language) })}
    </span>
  );
}

function StatusTimeline({ current }: { current: SubmissionStatus['status'] }) {
  const { t } = useTranslation();

  if (HALTED_STATUSES.has(current)) {
    return (
      <div className="status-timeline-halted">
        <span className="status-timeline-halted-icon" aria-hidden="true">
          <PixelIcon name={STATUS_ICONS[current]} size={13} />
        </span>
        <span className="status-timeline-halted-label">{t(`statusView.states.${current}.label`)}</span>
      </div>
    );
  }

  const currentIndex = TIMELINE_STEPS.indexOf(current);

  return (
    <ol className="status-timeline">
      {TIMELINE_STEPS.map((step, index) => {
        const stepState = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'upcoming';
        return (
          <li
            key={step}
            className={`status-timeline-step status-timeline-${stepState}`}
            aria-current={stepState === 'active' ? 'step' : undefined}
          >
            <span className="status-timeline-dot" aria-hidden="true">
              <PixelIcon name={stepState === 'done' ? 'check' : STATUS_ICONS[step]} size={13} />
            </span>
            <span className="status-timeline-label">{t(`statusView.states.${step}.label`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** A change request sent from this tab, echoed locally until the API returns it. */
type PendingRevision = { text: string; at: number };

/** Failure reasons with their own copy; anything newer gets the generic sentence. */
const FAILURE_COPY_KEYS = new Set([
  'task_failed',
  'task_timed_out',
  'task_completed_without_delivery',
  'gate_red',
  'self_build_delivery_cap',
]);

function failureCopyKey(reason: string): string {
  return FAILURE_COPY_KEYS.has(reason) ? reason : 'generic';
}

const REMEMBERED_STATUS_CHIP = 'stall:ended';
const STATUS_CHIP_DISMISSAL_PREFIX = 'gamedev_status_chip_dismissed:';

function hasDismissedStatusChip(chipKey: string): boolean {
  if (chipKey !== REMEMBERED_STATUS_CHIP) return false;
  return readStorageItem(`${STATUS_CHIP_DISMISSAL_PREFIX}${chipKey}`) === '1';
}

/** Dismissible status chip above the composer. */
function ThreadStatusChip({ chipKey, children }: { chipKey: string; children: ReactNode }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => hasDismissedStatusChip(chipKey));

  const dismiss = () => {
    setDismissed(true);
    if (chipKey !== REMEMBERED_STATUS_CHIP) return;
    writeStorageItem(`${STATUS_CHIP_DISMISSAL_PREFIX}${chipKey}`, '1');
  };

  if (dismissed) return null;

  return (
    <div className="studio-status-chip status-warning" role="status" data-chip-key={chipKey}>
      <span className="studio-status-chip-body">{children}</span>
      <button
        type="button"
        className="studio-status-chip-dismiss"
        onClick={dismiss}
        aria-label={t('notifications.dismiss')}
      >
        <PixelIcon name="close" size={12} />
      </button>
    </div>
  );
}

type SubmissionStatusViewProps = {
  token: string;
  submittedTitle?: string;
  submittedConcept?: string;
  trackingUrl?: string;
  /** Sends the creator home with this idea loaded, ready to edit and resubmit. */
  onRetry?: (concept: string) => void;
  /**
   * Opens the studio's playtest surface on this game. Present only when this view is
   * embedded in Creator Studio, which is the only place that surface exists.
   */
  onPlaytest?: () => void;
  /**
   * Opens Studio Details for MCP install — keeps tall connect chrome out of the thread.
   */
  onOpenConnect?: () => void;
  /**
   * When true, this view is nested inside Creator Studio (the Build tab). The
   * outer studio chrome already names the game — skip the page-level heading /
   * save-link lecture and point share URLs at `/studio/:token`.
   */
  embedded?: boolean;
  /**
   * Publishing is terminal: an improvement on a live game opens a *new* job with its
   * own token, and the creator's thread must move onto it. Embedded in Studio the
   * parent owns the open thread, so it does the switch (see CreatorStudioView). When
   * absent — the standalone `/status/:token` view — this component navigates the
   * browser to the new token itself.
   */
  onImproved?: (token: string) => void;
  /**
   * Marks this mount as the destination of an improvement handoff, so the new build
   * thread announces itself rather than appearing out of nowhere. Set by the parent
   * that performed the switch.
   */
  justHandedOff?: boolean;
  /**
   * Embedded only: reports the transcript's entry count and latest entry's text on
   * every change, so a parent shell that collapses this thread (the game-first
   * layout's `StudioChatRail`) can derive an unread badge and a one-line peek without
   * duplicating `buildActivityFeed`. `latest` is untrusted, agent- or creator-authored
   * text — render it escaped, same as every other transcript row.
   */
  onActivityCount?: (count: number, latest: string | null) => void;
  draft?: { text: string; seq: number } | null;
  onDraftConsumed?: () => void;
};

export function SubmissionStatusView({
  token,
  submittedTitle,
  submittedConcept,
  trackingUrl,
  onRetry,
  onPlaytest,
  onOpenConnect,
  embedded = false,
  onImproved,
  justHandedOff = false,
  onActivityCount,
  draft,
  onDraftConsumed,
}: SubmissionStatusViewProps) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [pendingRevisions, setPendingRevisions] = useState<PendingRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInvalidToken, setIsInvalidToken] = useState(false);
  const [preview, setPreview] = useState<SubmissionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRefreshing, setPreviewRefreshing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Early channel build HTML (pre-commit). Loaded as text so GameTheater can inject
  // the player bridge — same sandbox as framing by URL, with working Escape/sound.
  const [channelHtml, setChannelHtml] = useState<string | null>(null);
  const [channelLoading, setChannelLoading] = useState(false);

  // Which game (if any) is open in the full-viewport theater. HTML is snapshotted at
  // launch (`launchedHtml`) so a background refresh doesn't reload the game out from
  // under the player mid-session — reopening picks up the latest. Channel builds use
  // the same path as PR drafts: fetched as text, then srcdoc + player bridge.
  const [playing, setPlaying] = useState<'draft' | 'published' | null>(null);
  const [launchedHtml, setLaunchedHtml] = useState<string | null>(null);

  // Tracks the PR head SHA the currently-displayed preview was built from, so we
  // only re-fetch (and reload the iframe) when the agent has actually pushed new
  // work — not on every status poll.
  const loadedPreviewShaRef = useRef<string | null>(null);
  const previewInFlightRef = useRef(false);
  const loadedChannelRef = useRef<string | null>(null);
  const channelInFlightRef = useRef(false);
  // The newest channel item wanted while an older fetch is in flight.
  const pendingChannelItemRef = useRef<BuildPlayableItem | null>(null);
  // True while `status` is a stale value cached by another consumer's poll.
  const wasCachedBootstrapRef = useRef(false);

  // Same reasoning as presence.ts's onVisibility: a backgrounded tab's poll timer gets
  // throttled by the browser, so a self-build round can finish unwatched for minutes.
  //
  // Sleep/wake can leave the tab "visible" with no edge to catch.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') pokeStudioStatus(token, i18n.language);
    };
    const onWake = () => pokeStudioStatus(token, i18n.language);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
    };
  }, [token, i18n.language]);

  const currentTrackingUrl = useMemo(
    () => trackingUrl ?? new URL(embedded ? studioPath(token) : statusPath(token), window.location.href).toString(),
    [token, trackingUrl, embedded],
  );

  /**
   * Move the creator onto the new job an improvement just opened. Embedded, the parent
   * owns which thread is on screen, so it does the switch (and re-mounts us on the new
   * token with `justHandedOff`). Standalone, we drive the browser there ourselves — the
   * same programmatic push App uses. App only re-reads the route on popstate/hashchange
   * (pushState is silent), so we fire PopStateEvent after the push; NAVIGATE_EVENT still
   * announces for telemetry listeners.
   */
  const handleImproved = (newToken: string) => {
    if (onImproved) {
      onImproved(newToken);
      return;
    }
    const path = statusPath(newToken);
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { path } }));
  };

  useEffect(() => {
    setStatus(null);
    setPendingRevisions([]);
    setLoading(true);
    setErrorMessage(null);
    setIsInvalidToken(false);
    setPlaying(null);
    setLaunchedHtml(null);
    setPreview(null);
    setPreviewLoading(false);
    setPreviewRefreshing(false);
    setPreviewError(null);
    setChannelHtml(null);
    setChannelLoading(false);
    loadedPreviewShaRef.current = null;
    previewInFlightRef.current = false;
    loadedChannelRef.current = null;
    channelInFlightRef.current = false;
    pendingChannelItemRef.current = null;

    let synchronousDelivery = true;
    const unsubscribe = subscribeStudioStatus(
      token,
      i18n.language,
      {
        intervalMs: (latest, error) => {
          if (error) {
            // Invalid token: nothing further to poll for.
            if (error.status === 400) return null;
            // Transient failure (network blip, rate limit) — retry at the idle cadence.
            return pollDelayMs('queued');
          }
          return latest ? pollDelayMs(latest.status, latest.stall, latest.phase) : pollDelayMs('queued');
        },
        onUpdate: (next) => {
          wasCachedBootstrapRef.current = synchronousDelivery;
          setStatus(next);
          setLoading(false);
          setErrorMessage(null);
          setIsInvalidToken(false);
        },
        onError: (err) => {
          wasCachedBootstrapRef.current = synchronousDelivery;
          setStatus(null);
          setLoading(false);
          setIsInvalidToken(err.status === 400);
          setErrorMessage(err.status === 400 ? t('statusView.invalidToken') : t('errors.generic'));
        },
      },
      { forceFreshOnMount: true },
    );
    synchronousDelivery = false;
    return unsubscribe;
    // i18n.language is a dependency because the API localizes the build log for us.
  }, [i18n.language, t, token]);

  const publishedGameTitle = submittedTitle ?? status?.slug ?? t('statusView.publishedGameTitle');
  const heartbeatAt = latestAgentActivityAt(status);
  const selfCopy = selfStatusCopy(copyInputFromStatus(status));

  /**
   * What is happening, in the creator's words.
   *
   * Only the phases that mean something the coarse status cannot say carry their own
   * sentence (see `statusView.phases`); everything else falls through to the status
   * copy rather than being written twice and drifting. Self rounds replace the
   * platform "an agent picks it up" sentence while still waiting to connect.
   */
  // Remix save-as-yours reuses ready_for_review / in_review so Studio treats the
  // draft as playable — but gate-green "passed every check / waiting to go live"
  // is a lie for that path (no gate, never publishes). Own copy when the API says so.
  const isRemixDraft = status?.draftOrigin === 'remix';
  const stateDescription = status
    ? selfCopy === 'no_agent_yet'
      ? t('statusView.stall.no_agent_yet')
      : isRemixDraft && (status.phase === 'ready_for_review' || status.status === 'in_review')
        ? t('statusView.remix.ready')
        : (status.phase ? t(`statusView.phases.${status.phase}`, { defaultValue: '' }) : '') ||
          t(`statusView.states.${status.status}.description`)
    : '';

  // Studio telemetry: first agent signal + gate verdict, with builder dimension.
  // Emit only on transitions observed during this mount — a reload of an already
  // finished submission must not mint a fresh gate_verdict (visit stream is per-tab).
  const prevStallRef = useRef<SubmissionStatus['stall'] | undefined>(undefined);
  const prevBuilderRef = useRef<SubmissionStatus['builder'] | undefined>(undefined);
  const prevVerdictRef = useRef<StudioStepDetail | null | undefined>(undefined);
  const prevOpenedByRef = useRef<SubmissionStatus['openedBy'] | undefined>(undefined);
  const hasSeenStatusRef = useRef(false);
  useEffect(() => {
    if (embedded)
      onActivityCountRef.current?.(activity.length, activity.length > 0 ? activity[activity.length - 1].text : null);
    // A cached snapshot from another consumer's poll is not an observed transition.
    if (!status || wasCachedBootstrapRef.current) return;
    const builder = status.builder && isBuilderKind(status.builder) ? status.builder : null;

    const failureReason = status.failure?.reason;
    let verdict: StudioStepDetail | null = null;
    if (failureReason === 'gate_red') verdict = 'red';
    else if (failureReason === 'kit_outdated') verdict = 'kit_outdated';
    else if (
      status.status === 'in_review' ||
      status.status === 'publishing' ||
      status.status === 'published' ||
      status.phase === 'ready_for_review'
    ) {
      verdict = 'green';
    }

    if (builder) {
      if (
        builder === 'self' &&
        prevBuilderRef.current === builder &&
        prevStallRef.current === 'no_agent_yet' &&
        status.stall !== 'no_agent_yet'
      ) {
        recordStudioStep('agent_signaled', builder);
      }
      if (hasSeenStatusRef.current && verdict && prevVerdictRef.current !== verdict) {
        recordStudioStep('gate_verdict', builder, verdict);
      }
      if (status.openedBy) {
        if (!hasSeenStatusRef.current) {
          recordStudioStep('round_opened', builder, status.openedBy);
        } else if (prevOpenedByRef.current !== status.openedBy) {
          recordStudioStep('round_opened', builder, status.openedBy);
        }
      }
    }

    prevStallRef.current = status.stall;
    prevBuilderRef.current = status.builder;
    prevVerdictRef.current = verdict;
    prevOpenedByRef.current = status.openedBy;
    hasSeenStatusRef.current = true;
    // `activity`/`embedded` deliberately excluded: this effect is keyed on `status`
    // alone so the telemetry above stays idempotent (see the comment at the top of this
    // block), and `onActivityCountRef` is already a ref precisely so its report can
    // ride along without becoming a second effect (see the comment where it is declared).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // No share link here any more. It used to be shown unconditionally and pointed at
  // `/play/<slug>`, which was readable by any signed-in visitor who knew the slug.
  // Sharing an unpublished game is now the creator's decision, made on one switch in
  // Creator Studio; advertising a link that 404s until that switch is on would be worse
  // than not offering one. A published game shares from the theater, as it always has.

  // Auto-load the live preview as soon as one is available, and silently refresh it
  // whenever the agent pushes a new commit (headSha changes) — no click required.
  useEffect(() => {
    const previewSlug = status?.preview?.slug;
    const headSha = status?.progress?.headSha;
    const gateRun = status?.previewGate?.ranAt ?? '';
    const previewKey = `${headSha ?? 'unknown'}:${gateRun}`;
    if (!previewSlug || previewInFlightRef.current) return;
    if (headSha && previewKey === loadedPreviewShaRef.current) return;
    // Without a headSha we can't tell if there's anything new — only load once.
    if (!headSha && loadedPreviewShaRef.current !== null) return;

    previewInFlightRef.current = true;
    const isRefresh = loadedPreviewShaRef.current !== null;
    if (isRefresh) {
      setPreviewRefreshing(true);
    } else {
      setPreviewLoading(true);
    }
    setPreviewError(null);

    getSubmissionPreview(token)
      .then((result) => {
        setPreview(result);
        loadedPreviewShaRef.current = previewKey;
      })
      .catch((err: unknown) => {
        const apiError = err as SubmissionApiError;
        // On a refresh failure, keep showing the last-good preview rather than clearing it.
        if (!isRefresh) {
          setPreview(null);
        }
        loadedPreviewShaRef.current = previewKey;
        setPreviewError(apiError.status === 409 ? t('statusView.previewNotReady') : t('statusView.previewError'));
      })
      .finally(() => {
        previewInFlightRef.current = false;
        setPreviewLoading(false);
        setPreviewRefreshing(false);
      });
  }, [status?.preview?.slug, status?.progress?.headSha, status?.previewGate?.ranAt, t, token]);

  // Prefetch the latest channel build when there is no PR preview yet — same PlayCard
  // → theater path, so Escape / sound / chrome-hide need the player bridge, which
  // means the HTML has to arrive as text (srcdoc), not as an iframe `src`.
  useEffect(() => {
    const latest = status?.playable?.[0];
    if (preview || !latest) {
      if (!latest) {
        setChannelHtml(null);
        loadedChannelRef.current = null;
      }
      return;
    }
    if (latest.ref === loadedChannelRef.current) return;
    // Set even mid-fetch — `finally` below checks back, so nothing is dropped.
    pendingChannelItemRef.current = latest;
    if (channelInFlightRef.current) return;

    const load = (item: BuildPlayableItem) => {
      channelInFlightRef.current = true;
      setChannelLoading(true);
      setPreviewError(null);

      getChannelPlayable(token, item)
        .then((html) => {
          setChannelHtml(html);
          loadedChannelRef.current = item.ref;
          // A working channel draft is enough to play — clear any PR-preview failure
          // so we don't leave a red banner under a live "Play the draft" card.
          setPreviewError(null);
        })
        .catch((err: unknown) => {
          const apiError = err as SubmissionApiError;
          setChannelHtml(null);
          setPreviewError(apiError.status === 409 ? t('statusView.previewNotReady') : t('statusView.previewError'));
        })
        .finally(() => {
          channelInFlightRef.current = false;
          setChannelLoading(false);
          const pending = pendingChannelItemRef.current;
          if (pending && pending.ref !== loadedChannelRef.current) load(pending);
        });
    };

    load(latest);
  }, [preview, status?.playable, t, token]);

  const previewTitle = preview?.title ?? submittedTitle ?? status?.preview?.slug ?? t('statusView.previewGameTitle');
  const previewGateFailure = status?.previewGate && !status.previewGate.green ? status.previewGate : null;

  // Lock page scroll while the theater overlay is open (matches the home player).
  useEffect(() => {
    if (!playing) return;
    document.body.classList.add('player-open');
    return () => document.body.classList.remove('player-open');
  }, [playing]);

  const openDraft = () => {
    if (!preview) return;
    setLaunchedHtml(preview.html);
    setPlaying('draft');
  };
  const openChannel = () => {
    if (!channelHtml) return;
    setLaunchedHtml(channelHtml);
    setPlaying('draft');
  };
  const closeTheater = () => {
    setPlaying(null);
    setLaunchedHtml(null);
  };

  const latestChannelBuild = status?.playable?.[0] ?? null;
  // PR preview wins when both exist — same PlayCard, theater on click. An inline
  // iframe for the channel build used to sit under that card and doubled the "play"
  // surface; Studio's own playtest already learned inset frames are unplayable on
  // phones, so everything playable here opens the theater.

  const theaters = (
    <>
      {playing === 'published' && status?.status === 'published' && status.slug ? (
        <GameTheater
          title={publishedGameTitle}
          badge={{ icon: 'gamepad', label: t('catalog.playingBadge', { defaultValue: 'Playing' }) }}
          source={{ slug: status.slug }}
          onExit={closeTheater}
        />
      ) : null}

      {playing === 'draft' && launchedHtml != null ? (
        <GameTheater
          title={
            preview ? previewTitle : (submittedTitle ?? latestChannelBuild?.slug ?? t('statusView.previewGameTitle'))
          }
          badge={{ icon: 'wrench', label: t('statusView.draftBadge') }}
          source={{ html: launchedHtml }}
          onExit={closeTheater}
        />
      ) : null}
    </>
  );

  const handoffToPlatformFromUi = () =>
    handoffToPlatform(token, {
      stopActiveSelfAgent: Boolean(status?.builder === 'self' && isAgentWorkActive(status)),
    }).then((result) => {
      pokeStudioStatus(token, i18n.language);
      return result;
    });

  const handoffToSelfFromUi = () =>
    handoffToSelf(token).then((result) => {
      pokeStudioStatus(token, i18n.language);
      return result;
    });

  // Hoisted above the `embedded` branch below so `StudioChatRail` can derive an
  // unread badge from the same count without re-running `buildActivityFeed` itself.
  // A plain computed value, not `useMemo` behind its own `useEffect` — this component's
  // status poll (above) depends on an unstabilized `t`, so it re-runs on every render;
  // one more independently-scheduled effect here was enough to multiply its fire count
  // under fake timers (and, on the real clock, waste real polls). Reported from the
  // existing per-`status` telemetry effect below instead of a new one of its own.
  const activity =
    embedded && status
      ? buildActivityFeed(
          status.progress,
          status.events ?? [],
          pendingRevisions,
          status.media ?? [],
          t('statusView.gallery.caption'),
        )
      : [];
  const onActivityCountRef = useRef(onActivityCount);
  onActivityCountRef.current = onActivityCount;

  /**
   * Inside Creator Studio this is a thread, not a page.
   *
   * The standalone `/status/<token>` view below keeps its page shape — it is a link
   * somebody was sent, read once, top to bottom. This one is a place the creator comes
   * back to, so it is built the way every other place you talk to something is: the
   * conversation scrolls, and the box you answer in does not move.
   */
  if (embedded) {
    const agentWorking = Boolean(status && isAgentWorkActive(status));
    const gateThought =
      status?.gateProgress?.stage && agentWorking
        ? {
            key: status.gateProgress.stage,
            at: Date.parse(status.gateProgress.at) || Date.now(),
            label: t(`statusView.gateProgress.${status.gateProgress.stage}`, {
              defaultValue: t('statusView.phases.gating'),
            }),
          }
        : null;
    const workingThought = gateThought ? null : status && agentWorking ? presenceThought(status) : null;
    const workingThoughtLabel =
      gateThought?.label ||
      (workingThought != null ? t(`statusView.presence.${workingThought.key}`, { defaultValue: '' }) : '');
    const workingPhaseLabel =
      status && agentWorking
        ? gateThought
          ? t('statusView.phases.gating')
          : status.phase === 'dispatched'
            ? t('statusView.phaseLabels.dispatched')
            : t(`statusView.states.${status.status}.label`)
        : '';
    // Foot bar owns the waiting caption — the card drops it. `quiet` only suppresses it
    // for the plain in-progress label ("Writing code" 6h stale); the self-connect and
    // ready_for_review branches already say something accurate regardless of staleness.
    const footBarShowing = Boolean(
      status &&
      !agentWorking &&
      status.stall !== 'ended' &&
      !status.agentEndedAt &&
      (status.stall !== 'quiet' || isAwaitingOwnAgent(status) || status.phase === 'ready_for_review'),
    );
    return (
      <>
        <div className="studio-thread">
          {justHandedOff ? (
            <p className="status-handoff-notice" role="status">
              <PixelIcon name="sparkle" size={13} /> {t('statusView.handoff.notice')}
            </p>
          ) : status?.openedBy === 'agent' ? (
            <p className="status-handoff-notice" role="status">
              <PixelIcon name="sparkle" size={13} /> {t('statusView.handoff.agentOpened')}
            </p>
          ) : null}
          {loading ? (
            <p className="catalog-state studio-thread-empty">{t('statusView.loading')}</p>
          ) : errorMessage ? (
            <div className="studio-thread-empty">
              <p className="error">{errorMessage}</p>
              <p className="status-description">
                {isInvalidToken ? t('statusView.invalidTokenHelp') : t('statusView.fetchErrorHelp')}
              </p>
            </div>
          ) : status ? (
            <>
              <ThreadStream
                token={token}
                entries={activity}
                emptyLabel={stateDescription}
                priorRounds={status.slug && status.priorRounds?.length ? status.priorRounds : undefined}
                priorSlug={status.slug}
                stickNonce={(isAwaitingOwnAgent(status) ? pendingRevisions.length + 1 : 0) + (agentWorking ? 1 : 0)}
                working={
                  agentWorking
                    ? {
                        label: workingPhaseLabel,
                        thoughtLabel: workingThoughtLabel || null,
                        thoughtKey: gateThought?.key ?? workingThought?.key ?? null,
                        thoughtAt: gateThought?.at ?? workingThought?.at ?? null,
                        heartbeatAt: gateThought ? Date.parse(status.gateProgress!.at) || heartbeatAt : heartbeatAt,
                      }
                    : null
                }
                after={
                  isAwaitingOwnAgent(status) ? (
                    <StudioConnectCard
                      key={`connect-${pendingRevisions.length}`}
                      token={token}
                      mode={connectCardMode(copyInputFromStatus(status)) ?? 'setup'}
                      {...(onOpenConnect ? { onOpenInstall: onOpenConnect } : {})}
                      waitingCaptionElsewhere={footBarShowing}
                      onSwitchToPlatform={handoffToPlatformFromUi}
                      builderHandoffPending={status.builderHandoff?.target === 'platform'}
                      platformUnavailable={
                        status.platformBuilder?.available === false ? status.platformBuilder.reason : undefined
                      }
                    />
                  ) : null
                }
              />

              <div className="studio-thread-foot">
                {/* Trouble is said once, immediately above the box the creator would use
                    to do something about it. A dead round outranks a slow one: when both
                    are set the failure is the explanation and the stall is its symptom.
                    `needs_changes` without a typed failure (legacy GitHub path) still
                    needs a sentence here — the thread's emptyLabel only shows when there
                    are no turns, which is exactly when a bounced build still has planning
                    notes and used to look like nothing was wrong.
                    Self rounds: no-agent-yet / quiet resurface the connect card inside
                    the transcript scroller (not this foot) so a phone still has room for
                    the conversation. Gate-green is Done — no connect, no stale quiet chip.
                    Delivery-cap is a failure sentence. When the connect card is up, skip
                    the quiet chip — the card lead already says it. */}
                {status.failure ? (
                  <ThreadStatusChip
                    key={`failure:${status.failure.reason}`}
                    chipKey={`failure:${status.failure.reason}`}
                  >
                    <PixelIcon name="signal" size={13} />
                    <span>{t(`statusView.failure.${failureCopyKey(status.failure.reason)}`)}</span>
                  </ThreadStatusChip>
                ) : status.status === 'needs_changes' ? (
                  <ThreadStatusChip key="needs_changes" chipKey="needs_changes">
                    <PixelIcon name="signal" size={13} />
                    <span>{t('statusView.states.needs_changes.description')}</span>
                  </ThreadStatusChip>
                ) : isAwaitingOwnAgent(status) || status.phase === 'ready_for_review' ? null : status.stall ? (
                  <ThreadStatusChip key={`stall:${status.stall}`} chipKey={`stall:${status.stall}`}>
                    <PixelIcon name="signal" size={13} />
                    <span>{t(`statusView.stall.${status.stall}`)}</span>
                  </ThreadStatusChip>
                ) : status.progress?.checks === 'FAILURE' ? (
                  <ThreadStatusChip key="checks_failure" chipKey="checks_failure">
                    <PixelIcon name="signal" size={13} />
                    <span>{t('statusView.checksFailed')}</span>
                  </ThreadStatusChip>
                ) : null}

                {previewError && !preview && !channelHtml && !previewGateFailure ? (
                  <p className="error">{previewError}</p>
                ) : null}

                {TERMINAL_STATUSES.has(status.status) &&
                status.status !== 'published' &&
                submittedConcept &&
                onRetry ? (
                  <button className="primary-btn status-retry" onClick={() => onRetry(submittedConcept)}>
                    <PixelIcon name="undo" size={13} /> {t('statusView.tryAgain')}
                  </button>
                ) : null}

                {/* Active "Writing code" lives as the last transcript turn (Claude-shaped).
                    The foot bar is only for waiting / review captions — and never when the
                    agent already called end (stall chip covers that; "Writing code" would lie). */}
                {footBarShowing ? (
                  <ThreadContextBar
                    phase={
                      isAwaitingOwnAgent(status)
                        ? selfCopy === 'no_agent_yet'
                          ? t('connect.waiting')
                          : t('connect.resume.waiting')
                        : isRemixDraft && (status.status === 'in_review' || status.phase === 'ready_for_review')
                          ? t('statusView.remix.label')
                          : status.phase === 'dispatched'
                            ? t('statusView.phaseLabels.dispatched')
                            : t(`statusView.states.${status.status}.label`)
                    }
                    thought={
                      isAwaitingOwnAgent(status) ||
                      TERMINAL_STATUSES.has(status.status) ||
                      status.status === 'in_review' ||
                      status.phase === 'ready_for_review'
                        ? null
                        : presenceThought(status)
                    }
                    heartbeatAt={isAwaitingOwnAgent(status) ? null : heartbeatAt}
                    active={false}
                  />
                ) : null}

                {status.status !== 'abandoned' && selfCopy !== 'no_agent_yet' ? (
                  <FeedbackPanel
                    token={token}
                    published={status.status === 'published'}
                    building={!preview && !channelHtml}
                    compact
                    chooseBuilder={canChooseBuilder(status)}
                    initialBuilder={resolveDefaultBuilder(token, status)}
                    roundBuilder={status.builder && isBuilderKind(status.builder) ? status.builder : undefined}
                    stall={status.stall}
                    failureReason={status.failure?.reason}
                    phase={status.phase}
                    handoffPending={status.builderHandoff?.target}
                    agentWorking={agentWorking}
                    draft={draft}
                    onDraftConsumed={onDraftConsumed}
                    onSwitchToPlatform={
                      status.builder === 'self' && (agentWorking || status.builderHandoff?.target === 'platform')
                        ? handoffToPlatformFromUi
                        : undefined
                    }
                    onSwitchToSelf={
                      canOfferSelfHandoff(status) || status.builderHandoff?.target === 'self'
                        ? handoffToSelfFromUi
                        : undefined
                    }
                    platformUnavailable={
                      status.platformBuilder?.available === false ? status.platformBuilder.reason : undefined
                    }
                    suppressRouteNote={isAwaitingOwnAgent(status) || status.phase === 'ready_for_review'}
                    onSent={(text) => {
                      setPendingRevisions((current) => [...current, { text, at: Date.now() }]);
                      // Feedback may have switched builder or landed on `dispatched` —
                      // pull status now so we do not keep painting the previous stall.
                      pokeStudioStatus(token, i18n.language);
                    }}
                    onPublishedImprove={handleImproved}
                  />
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        {theaters}
      </>
    );
  }

  return (
    <>
      <section className="panel status-panel">
        {justHandedOff ? (
          <p className="status-handoff-notice" role="status">
            <PixelIcon name="sparkle" size={13} /> {t('statusView.handoff.notice')}
          </p>
        ) : status?.openedBy === 'agent' ? (
          <p className="status-handoff-notice" role="status">
            <PixelIcon name="sparkle" size={13} /> {t('statusView.handoff.agentOpened')}
          </p>
        ) : null}
        {
          <>
            <div className="status-heading">
              <h2 className="section-title">{submittedTitle ?? t('statusView.title')}</h2>
              {status && !TERMINAL_STATUSES.has(status.status) ? (
                <span className="status-live">
                  <span className="live-dot" aria-hidden="true" />
                  {t('statusView.live')}
                  {heartbeatAt !== null ? (
                    <>
                      {' · '}
                      <BuildHeartbeat at={heartbeatAt} />
                    </>
                  ) : null}
                </span>
              ) : null}
            </div>
            {submittedConcept ? <p className="status-brief">“{submittedConcept}”</p> : null}
            <p className="status-note">
              {t('statusView.saveLink')}{' '}
              <a className="inline-link" href={currentTrackingUrl}>
                {currentTrackingUrl}
              </a>
            </p>
          </>
        }
        {loading ? (
          <p className="catalog-state">{t('statusView.loading')}</p>
        ) : errorMessage ? (
          <>
            <p className="error">{errorMessage}</p>
            <p className="status-description">
              {isInvalidToken ? t('statusView.invalidTokenHelp') : t('statusView.fetchErrorHelp')}
            </p>
            <a className="inline-link" href="/">
              {t('statusView.backHome')}
            </a>
          </>
        ) : status ? (
          <>
            <StatusTimeline current={status.status} />
            <p className="status-description" aria-live="polite">
              {stateDescription}
            </p>

            {status.progress?.checks === 'FAILURE' ? (
              <p className="status-warning">
                <PixelIcon name="signal" size={13} /> {t('statusView.checksFailed')}
              </p>
            ) : null}

            {/* A dead round outranks a slow one: when both are set, the failure is
                the explanation and the stall is just its symptom. Self quiet keeps
                its warning and resurfaces the connect card. Agent-ended offers handoff
                without reconnect. Gate-green suppresses a stale quiet stall — Final
                check is Done, not "agent wandered off". */}
            {status.failure ? (
              <p className="status-warning">
                <PixelIcon name="signal" size={13} /> {t(`statusView.failure.${failureCopyKey(status.failure.reason)}`)}
              </p>
            ) : status.phase === 'ready_for_review' ? null : selfCopy === 'no_agent_yet' ? null : selfCopy ===
              'quiet_agent' ? (
              <p className="status-warning">
                <PixelIcon name="signal" size={13} /> {t('statusView.stall.quietSelf')}
              </p>
            ) : selfCopy === 'agent_ended' ? (
              <p className="status-warning">
                <PixelIcon name="signal" size={13} /> {t('statusView.stall.endedSelf')}
              </p>
            ) : status.stall ? (
              <p className="status-warning">
                <PixelIcon name="signal" size={13} /> {t(`statusView.stall.${status.stall}`)}
              </p>
            ) : null}

            {isAwaitingOwnAgent(status) ? (
              <StudioConnectCard
                key={`connect-${pendingRevisions.length}`}
                token={token}
                mode={connectCardMode(copyInputFromStatus(status)) ?? 'setup'}
                onSwitchToPlatform={handoffToPlatformFromUi}
                builderHandoffPending={status.builderHandoff?.target === 'platform'}
                platformUnavailable={
                  status.platformBuilder?.available === false ? status.platformBuilder.reason : undefined
                }
              />
            ) : null}

            {TERMINAL_STATUSES.has(status.status) && status.status !== 'published' && submittedConcept && onRetry ? (
              <button className="primary-btn status-retry" onClick={() => onRetry(submittedConcept)}>
                <PixelIcon name="undo" size={13} /> {t('statusView.tryAgain')}
              </button>
            ) : null}

            {status.status === 'published' && status.slug ? (
              <PlayCard
                badgeClass="is-live"
                badge={
                  <>
                    <span className="live-dot" aria-hidden="true" /> {t('statusView.states.published.label')}
                  </>
                }
                title={publishedGameTitle}
                subtitle={t('statusView.slug', { slug: status.slug })}
                cta={t('statusView.play')}
                onPlay={() => setPlaying('published')}
              />
            ) : preview ? (
              <PlayCard
                badge={
                  <>
                    <span className="live-dot" aria-hidden="true" />{' '}
                    {previewRefreshing ? t('statusView.previewUpdating') : t('statusView.previewBadge')}
                  </>
                }
                title={previewTitle}
                subtitle={t('statusView.draftHint')}
                cta={t('statusView.playDraft')}
                onPlay={openDraft}
                {...(onPlaytest ? { secondary: { label: t('statusView.playtestCta'), onClick: onPlaytest } } : {})}
              />
            ) : channelHtml && latestChannelBuild ? (
              <PlayCard
                badge={
                  <>
                    <span className="live-dot" aria-hidden="true" /> {t('statusView.previewBadge')}
                  </>
                }
                title={submittedTitle ?? latestChannelBuild.slug ?? t('statusView.previewGameTitle')}
                subtitle={latestChannelBuild.label ?? t('statusView.playableHint')}
                cta={t('statusView.playDraft')}
                onPlay={openChannel}
                {...(onPlaytest ? { secondary: { label: t('statusView.playtestCta'), onClick: onPlaytest } } : {})}
              />
            ) : previewGateFailure && !channelHtml ? (
              <div className="status-preview-error">
                <p className="error">{t('statusView.previewGateFailed')}</p>
                {previewGateFailure.report ? (
                  <details>
                    <summary>{t('statusView.previewGateDetails')}</summary>
                    <pre>{previewGateFailure.report}</pre>
                  </details>
                ) : null}
              </div>
            ) : previewLoading || channelLoading ? (
              <p className="status-preview-pending">
                <span className="status-preview-spinner" aria-hidden="true" /> {t('statusView.previewLoading')}
              </p>
            ) : null}

            <BuildProgressPanel
              token={token}
              progress={status.progress}
              events={status.events ?? []}
              media={status.media ?? []}
              pendingRevisions={pendingRevisions}
            />

            {/* One box, at the bottom, where a conversation keeps its reply — and it is
                the only one. There used to be three, all of them the same act: steer the
                build, request a change on the draft, improve the published game. Which
                one a creator was allowed depended on the game's lifecycle state, so they
                had to know it to find the right box. The server knows it; the placeholder
                says where the message lands, and the creator just writes.

                No mode to pick, either: a game is either published or it is not, and
                there is only ever the current version to work on. */}
            {status.status !== 'abandoned' && selfCopy !== 'no_agent_yet' ? (
              <FeedbackPanel
                token={token}
                published={status.status === 'published'}
                building={!preview && !channelHtml}
                agentWorking={isAgentWorkActive(status)}
                chooseBuilder={canChooseBuilder(status)}
                initialBuilder={resolveDefaultBuilder(token, status)}
                roundBuilder={status.builder && isBuilderKind(status.builder) ? status.builder : undefined}
                stall={status.stall}
                failureReason={status.failure?.reason}
                phase={status.phase}
                handoffPending={status.builderHandoff?.target}
                onSwitchToPlatform={
                  status.builder === 'self' &&
                  (isAgentWorkActive(status) || status.builderHandoff?.target === 'platform')
                    ? handoffToPlatformFromUi
                    : undefined
                }
                onSwitchToSelf={
                  canOfferSelfHandoff(status) || status.builderHandoff?.target === 'self'
                    ? handoffToSelfFromUi
                    : undefined
                }
                platformUnavailable={
                  status.platformBuilder?.available === false ? status.platformBuilder.reason : undefined
                }
                onSent={(text) => {
                  setPendingRevisions((current) => [...current, { text, at: Date.now() }]);
                  pokeStudioStatus(token, i18n.language);
                }}
                onPublishedImprove={handleImproved}
              />
            ) : null}

            {/* Only alarm when nothing is playable. A channel draft can succeed while
                the PR-branch assemble 502s (GitHub rate limits); showing both a Play
                card and this error was the Studio bug creators hit mid-build. */}
            {previewError && !preview && !channelHtml && !previewGateFailure ? (
              <p className="error">{previewError}</p>
            ) : null}

            <div className="status-footer-actions">
              <a className="inline-link" href="/">
                {t('statusView.backHome')}
              </a>
              {!TERMINAL_STATUSES.has(status.status) ? <AbandonControl token={token} /> : null}
            </div>
          </>
        ) : null}
      </section>
      {theaters}
    </>
  );
}

/** Stops the build for good after an explicit confirmation. */
function AbandonControl({ token }: { token: string }) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState<'idle' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);

  const abandon = async () => {
    setState('sending');
    setError(null);
    try {
      await abandonSubmission(token);
      // The poll picks up the terminal state on its next tick and re-renders.
    } catch {
      setError(t('statusView.abandon.error'));
      setState('idle');
      setArmed(false);
    }
  };

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (!armed) {
    return (
      <button
        type="button"
        className="status-abandon"
        onClick={() => setArmed(true)}
        title={t('statusView.abandon.start')}
        aria-label={t('statusView.abandon.start')}
      >
        {t('statusView.abandon.start')}
      </button>
    );
  }

  return (
    <span className="status-abandon-confirm">
      {t('statusView.abandon.confirm')}
      <button
        type="button"
        className="status-abandon is-danger"
        disabled={state === 'sending'}
        onClick={() => void abandon()}
      >
        {state === 'sending' ? t('statusView.abandon.sending') : t('statusView.abandon.yes')}
      </button>
      <button type="button" className="status-abandon" onClick={() => setArmed(false)}>
        {t('statusView.abandon.no')}
      </button>
    </span>
  );
}

/**
 * The "your game is playable" call-to-action inside the status panel. Clicking the
 * CTA opens the game in the full-viewport theater — so the status page itself never
 * embeds a live iframe inline (which would trap page scroll and duplicate the game's
 * own chrome). Used for both the work-in-progress draft and the published game.
 */
function PlayCard({
  badge,
  badgeClass,
  title,
  subtitle,
  cta,
  onPlay,
  secondary,
}: {
  badge: ReactNode;
  badgeClass?: string;
  title: string;
  subtitle?: string;
  cta: string;
  onPlay: () => void;
  /**
   * The other thing to do with a playable build. Playtesting is the studio's own
   * surface — pause the game, point at what is wrong, send the frame with the note —
   * and until this button existed the only route to it was noticing a tab.
   */
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <div className="status-play-card">
      <div className="status-play-card-info">
        <span className={badgeClass ? `status-play-badge ${badgeClass}` : 'status-play-badge'}>{badge}</span>
        <h3 className="status-play-card-title">{title}</h3>
        {subtitle ? <p className="status-play-card-sub">{subtitle}</p> : null}
      </div>
      <div className="status-play-card-actions">
        <button className="primary-btn status-play-cta" onClick={onPlay}>
          <PixelIcon name="play" size={13} /> {cta}
        </button>
        {secondary ? (
          <button className="secondary-btn status-playtest-cta" onClick={secondary.onClick}>
            <PixelIcon name="wrench" size={13} /> {secondary.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One picture of the build, full size, over the page.
 *
 * The pictures live on the timeline as thumbnails, which is where they belong: they
 * are things that happened, in among the sentences and commits describing the same
 * moments. But a thumbnail of a game is close to useless — you cannot see whether the
 * bridge holds — so any of them opens here at whatever size the viewport allows.
 */
function ShotLightbox({ token, item, onClose }: { token: string; item: BuildMediaItem; onClose: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="status-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={item.label || t('statusView.gallery.alt')}
      onClick={onClose}
    >
      {/* The image swallows the click so only the backdrop closes. */}
      <img
        className="status-lightbox-image"
        src={buildMediaUrl(token, item)}
        alt={item.label || t('statusView.gallery.alt')}
        onClick={(event) => event.stopPropagation()}
      />
      {item.label ? <p className="status-lightbox-caption">{item.label}</p> : null}
      <button type="button" className="status-lightbox-close" onClick={onClose}>
        {t('statusView.gallery.close')}
      </button>
    </div>
  );
}

/**
 * Revision loop: the creator describes what to change. The feedback is relayed to the
 * build agent (POST .../feedback), which both comments it onto the issue and queues it
 * on the build channel, so the agent picks it up on its next report. Shown while the
 * game is still in progress (or needs changes) — a published game can't be revised here.
 *
 * `building` swaps the copy for the stretch before a playable draft exists: there is
 * nothing to have "played" yet, and the useful ask is a course correction rather than a
 * revision.
 */
function FeedbackPanel({
  token,
  published,
  building,
  agentWorking = false,
  compact = false,
  chooseBuilder = false,
  initialBuilder = 'platform',
  roundBuilder,
  stall,
  failureReason,
  phase,
  suppressRouteNote = false,
  onSwitchToPlatform,
  onSwitchToSelf,
  handoffPending,
  platformUnavailable,
  onSent,
  onPublishedImprove,
  draft,
  onDraftConsumed,
}: {
  token: string;
  /** Routes the message: an improvement on the live game, or a change on the build. */
  published: boolean;
  building: boolean;
  agentWorking?: boolean;
  /** The thread's reply box rather than a page section — field and send, nothing else. */
  compact?: boolean;
  /** Show builder choice — the next send opens a new round. */
  chooseBuilder?: boolean;
  initialBuilder?: BuilderKind;
  /** Builder of the *current* round — drives self-build routing copy. */
  roundBuilder?: BuilderKind;
  stall?: SubmissionStatus['stall'];
  failureReason?: string;
  /** Internal job phase — gate-green drafts need honest "start your agent" routing. */
  phase?: SubmissionStatus['phase'];
  onSwitchToPlatform?: BuilderHandoffHandler;
  onSwitchToSelf?: BuilderHandoffHandler;
  handoffPending?: BuilderKind;
  // Why platform is unavailable, if it is. See BuilderChoice.
  platformUnavailable?: BuilderUnavailableReason;
  /**
   * Hide the "saved until you start your agent" line — the connect card above already
   * says we are waiting, so a third copy under the box is noise.
   */
  suppressRouteNote?: boolean;
  onSent: (text: string) => void;
  /**
   * A published-game improvement opened a new job; called with its token so the view
   * can move the creator onto the new build thread. Only fires on the `published`
   * path — a draft revision continues the current round and stays on this thread.
   */
  onPublishedImprove?: (token: string) => void;
  draft?: { text: string; seq: number } | null;
  onDraftConsumed?: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [quickActionDismissed, setQuickActionDismissed] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  // Sent, kept, and *not* acted on: the API took the message but no round started behind
  // it. Its own slot rather than `error`, because nothing failed on the creator's side and
  // there is nothing for them to redo — the note is safe and will be read by the next
  // round. Without this the composer says "sent" and the thread then says nothing for
  // hours, which is exactly how an exhausted agent allowance reads as a hung game.
  const [notice, setNotice] = useState<string | null>(null);
  const [builder, setBuilder] = useState<BuilderKind>(initialBuilder);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  // FileReader work not yet landed in attachments — Send waits for it.
  const [pendingAttachmentReads, setPendingAttachmentReads] = useState(0);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [isSketchOpen, setIsSketchOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const attachPanelRef = useClampToViewport<HTMLDivElement>(attachMenuOpen);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAttachMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [attachMenuOpen]);

  useEffect(() => {
    setBuilder(initialBuilder);
  }, [initialBuilder, token]);

  useEffect(() => {
    if (!draft) return;
    setText(draft.text);
    onDraftConsumed?.();
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.seq]);

  // Runs after `text` commits, so a seeded draft measures its real height.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (text.length === 0) {
      input.style.height = '';
      return;
    }
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
  }, [text]);

  useEffect(() => {
    setStopRequested(handoffPending === 'self');
  }, [handoffPending, token]);

  useEffect(() => {
    setQuickActionDismissed(false);
  }, [failureReason, token]);

  // A receipt is confirmation, not furniture: clear it on its own so the composer returns
  // to one row. Typing also clears it (below); the timer covers the common case where the
  // creator just watches the thread after send.
  useEffect(() => {
    if (state !== 'sent') return;
    const timer = window.setTimeout(() => setState('idle'), SENT_RECEIPT_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const trimmed = text.trim();
  // When choosing a builder for a new round, the selector is the truth; otherwise the
  // current round's builder drives the honest self-build routing note.
  const routeBuilder = chooseBuilder ? builder : roundBuilder;
  const composerRoute = selfComposerRoute({
    builder: routeBuilder,
    stall: chooseBuilder ? null : stall,
    failureReason: chooseBuilder ? null : failureReason,
    phase: chooseBuilder ? null : phase,
  });
  const sentSelfKey =
    composerRoute === 'active'
      ? 'statusView.feedback.sentSelfActive'
      : composerRoute === 'waiting'
        ? 'statusView.feedback.sentSelfWaiting'
        : null;
  // Active self rounds already imply a listening agent — repeating that above the
  // box is chrome noise (the placeholder covers "what to write"). Waiting is the
  // case that still needs a sentence: the note will not be read until they start
  // their agent again — unless the connect card already said that (`suppressRouteNote`).
  const routeNoteKey =
    !suppressRouteNote && composerRoute === 'waiting' ? 'statusView.feedback.routeSelfWaiting' : null;

  // The composer grows with what is typed, which is what replaced the resize grip: once
  // the send button moved inside the box, a drag handle in the middle of its right edge
  // read as a rendering fault. Capped, so a long message scrolls instead of pushing the
  // conversation off the top of the screen.
  const autoGrow = () => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
  };

  const handleAttachFiles = (files: FileList | File[]) => {
    if (state === 'sending') return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      setPendingAttachmentReads((count) => count + 1);
      const reader = new FileReader();
      const done = () => setPendingAttachmentReads((count) => count - 1);
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          setAttachments((prev) =>
            prev.length >= MAX_COMPOSER_ATTACHMENTS
              ? prev
              : [
                  ...prev,
                  { id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, dataUrl },
                ],
          );
        }
        done();
      };
      reader.onerror = done;
      reader.readAsDataURL(file);
    });
  };

  const handleSaveSketch = (dataUrl: string) => {
    setAttachments((prev) =>
      prev.length >= MAX_COMPOSER_ATTACHMENTS
        ? prev
        : [...prev, { id: `sketch-${Date.now()}`, name: `Sketch ${prev.length + 1}`, dataUrl }],
    );
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const send = async (requestedText: string = trimmed) => {
    const message = requestedText.trim();
    if (message.length < 10 || state === 'sending' || pendingAttachmentReads > 0) return;
    setState('sending');
    setError(null);
    setNotice(null);
    // Show "Sending…" for the whole HTTP round trip. Do **not** abort the fetch from
    // the browser: aborting does not cancel the Fastify handler, so a timed-out UI that
    // re-enabled Send could dispatch a second improve/feedback while the first was still
    // finishing (double job, double quota, round token invalidated). The agent-tasks
    // client bounds the server call; this button stays disabled until that answer lands.
    try {
      const roundBuilder = chooseBuilder ? builder : undefined;
      // Normalized to PNG for the backend's signature check.
      let context: { referenceImages: string[] } | undefined;
      if (attachments.length > 0) {
        const referenceImages = await toBase64PngList(attachments.map((a) => a.dataUrl));
        if (referenceImages.length > 0) context = { referenceImages };
      }
      // The new job an improvement opened, if this send was one — the thread hands over
      // to it once the local echo and receipt are in place, below.
      let handoffToken: string | undefined;
      // Same box, same act, different destination — decided here from the state the
      // server reported rather than by asking the creator which one they meant.
      // Shortest call shape for the ordinary case — tests assert on it.
      if (published) {
        const improved = roundBuilder
          ? await submitImprovement(token, message, context, roundBuilder)
          : context
            ? await submitImprovement(token, message, context)
            : await submitImprovement(token, message);
        // Publishing is terminal: the improvement is a new job with its own token. The
        // builder memory is keyed by token in localStorage, so persist the choice under
        // the *new* token as well — the old token's memory dies with its round.
        handoffToken = improved.token;
      } else {
        const result = roundBuilder
          ? await submitFeedback(token, message, context, roundBuilder)
          : context
            ? await submitFeedback(token, message, context)
            : await submitFeedback(token, message);
        if (result.roundStarted === false) {
          setNotice(
            result.reason === 'no_capacity' ? t('statusView.feedback.noCapacity') : t('statusView.feedback.notStarted'),
          );
        }
      }
      if (roundBuilder) {
        // A published improve moved to a new token; save the choice there too so the new
        // build thread's composer/connect defaults to it before its status echoes back.
        saveLastBuilder(handoffToken ?? token, roundBuilder);
        recordStudioStep('builder_chosen', roundBuilder);
      }
      setState('sent');
      setText('');
      setAttachments([]);
      // Back to the CSS height rather than the height the sent message grew it to: an
      // empty box the size of the last paragraph is a leftover, not a state.
      if (inputRef.current) inputRef.current.style.height = '';
      // Echo it into the activity feed straight away: the API only sees it once the
      // comment round-trips through GitHub, which is a poll or two away.
      onSent(message);
      // Then move the creator onto the new build thread. Last, so the receipt and the
      // local echo are already committed before the thread this box lives in is swapped.
      if (handoffToken) onPublishedImprove?.(handoffToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'content_rejected') {
        setError(t('errors.contentRejected.other'));
      } else if (message.includes('quota')) {
        setError(t('statusView.feedback.quota'));
      } else if (message.includes('published')) {
        setError(t('statusView.feedback.published'));
      } else {
        setError(t('statusView.feedback.error'));
      }
      setState('idle');
    }
  };

  const sendDebugCi = () => {
    setQuickActionDismissed(true);
    void send(t('statusView.feedback.debugCiPrompt'));
  };

  const handleBuilderChange = (next: BuilderKind) => {
    setBuilder(next);
  };

  // Three states, one box. The copy is the only thing that changes, and it changes so
  // the creator can see where their message is about to go without having chosen.
  const hintKey = published
    ? 'statusView.feedback.hintPublished'
    : building
      ? 'statusView.feedback.hintBuilding'
      : 'statusView.feedback.hint';
  const titleKey = published
    ? 'statusView.feedback.titlePublished'
    : building
      ? 'statusView.feedback.titleBuilding'
      : 'statusView.feedback.title';
  // The composer gets its own, much shorter version of the same three hints. The
  // paragraph reads fine above a page; as placeholder text on a phone it ran to four
  // lines and the box clipped the last of them mid-word — worse in Polish, where the
  // same sentence is longer. The placeholder now says where the message goes and stops.
  const composerHintKey = published
    ? 'statusView.feedback.composerHintPublished'
    : building
      ? 'statusView.feedback.composerHintBuilding'
      : 'statusView.feedback.composerHint';

  // Sticky builder signal in the composer toolbar (Claude/Cursor shape): always when
  // the next send can choose, and while a round is mid-flight so routing stays visible.
  // Handoff controls live here too; the transcript remains status-only.
  const effectiveBuilder = chooseBuilder ? builder : (roundBuilder ?? builder);
  const showBuilderBadge =
    chooseBuilder || effectiveBuilder === 'self' || Boolean(onSwitchToSelf) || (agentWorking && Boolean(roundBuilder));
  const builderSelector = showBuilderBadge ? (
    <BuilderModeBadge
      value={effectiveBuilder}
      onChange={handleBuilderChange}
      canChange={chooseBuilder}
      disabled={state === 'sending' || agentWorking}
      platformUnavailable={platformUnavailable}
    />
  ) : null;
  const activeSelfHandoff =
    !chooseBuilder && effectiveBuilder === 'self' && onSwitchToPlatform && state !== 'sending' ? (
      <SwitchToPlatformControl
        compact
        active
        onSwitchToPlatform={onSwitchToPlatform}
        pending={handoffPending === 'platform'}
        unavailable={platformUnavailable}
      />
    ) : null;
  const showStop =
    !chooseBuilder && agentWorking && effectiveBuilder === 'platform' && Boolean(onSwitchToSelf) && !stopRequested;
  // Hide the switch-to-self badge while STOP covers the same action.
  const activePlatformHandoff =
    !chooseBuilder && effectiveBuilder === 'platform' && onSwitchToSelf && !showStop && state !== 'sending' ? (
      <SwitchToSelfControl compact active onSwitchToSelf={onSwitchToSelf} pending={stopRequested} />
    ) : null;
  const stopAndSwitchToSelf = async () => {
    if (!onSwitchToSelf) return;
    setError(null);
    setStopRequested(true);
    try {
      const result = await onSwitchToSelf();
      recordStudioStep('builder_chosen', 'self');
      return result;
    } catch {
      setStopRequested(false);
      setError(t('connect.switchBuilder.error'));
    }
  };
  const builderControls = (
    <div className="builder-mode-controls">
      {builderSelector}
      {activeSelfHandoff}
      {activePlatformHandoff}
    </div>
  );

  // Standalone status page still shows a brief receipt next to Send. The studio
  // composer does not: the message is echoed into the thread immediately, so a
  // second "Sent!" under the box is the same confirmation twice.
  const sentReceipt =
    state === 'sent' && !notice && !error ? (
      <div className="status-feedback-receipt" role="status">
        <span className="status-feedback-sent">
          <PixelIcon name="check" size={13} />
          <span className="status-feedback-sent-text">{t(sentSelfKey ?? 'statusView.feedback.sent')}</span>
        </span>
        <button
          type="button"
          className="status-feedback-receipt-dismiss"
          onClick={() => setState('idle')}
          aria-label={t('statusView.feedback.dismissSent')}
        >
          <PixelIcon name="close" size={11} />
        </button>
      </div>
    ) : null;

  // Compact composer: field above, builder/send toolbar below.
  // Empty (`is-empty`): placeholder and send share one row.
  if (compact) {
    const sending = state === 'sending';
    const empty = text.length === 0;
    return (
      <div
        className={`status-feedback status-composer is-compact${empty ? ' is-empty' : ''}${sending ? ' is-sending' : ''}`}
        aria-busy={sending || undefined}
        onClick={(event) => {
          // Clicking card chrome focuses the textarea; skip real controls.
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest('button, a, textarea, input, select, [role="button"]')) return;
          inputRef.current?.focus();
        }}
      >
        {failureReason === 'gate_red' && !quickActionDismissed && !sending ? (
          <div className="status-feedback-quick-actions">
            <button type="button" className="status-feedback-quick-action" onClick={sendDebugCi}>
              <PixelIcon name="wrench" size={12} />
              {t('statusView.feedback.debugCi')}
            </button>
          </div>
        ) : null}
        {routeNoteKey && !sending && state !== 'sent' && !error && !notice ? (
          <p className="status-feedback-route">{t(routeNoteKey)}</p>
        ) : null}
        <textarea
          ref={inputRef}
          className="status-feedback-input"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            autoGrow();
            if (state === 'sent') setState('idle');
          }}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter keeps a newline (same as RemixAsk).
            // Skip while IME is composing — Enter confirms a candidate there.
            const native = event.nativeEvent;
            if (event.key !== 'Enter' || event.shiftKey || native.isComposing || native.keyCode === 229) {
              return;
            }
            event.preventDefault();
            void send();
          }}
          onPaste={(event) => {
            const pastedImages = Array.from(event.clipboardData?.items ?? [])
              .filter((item) => item.type.startsWith('image/'))
              .map((item) => item.getAsFile())
              .filter((file): file is File => file !== null);
            if (pastedImages.length > 0) handleAttachFiles(pastedImages);
          }}
          placeholder={t(composerHintKey)}
          aria-label={t(titleKey)}
          rows={1}
          maxLength={2000}
          disabled={sending}
        />
        {attachments.length > 0 && (
          <div className="status-composer-attachments">
            {attachments.map((item) => (
              <div key={item.id} className="status-composer-attachment-chip">
                <img src={item.dataUrl} alt={item.name} className="status-composer-attachment-thumb" />
                <button
                  type="button"
                  className="status-composer-attachment-remove"
                  onClick={() => removeAttachment(item.id)}
                  title={t('hero.removeAttachment')}
                  disabled={sending}
                >
                  <PixelIcon name="close" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="status-composer-toolbar">
          <div className="status-composer-toolbar-left">
            <div className="status-composer-attach" ref={attachMenuRef}>
              <button
                type="button"
                className={`status-composer-attach-btn${attachMenuOpen ? ' is-open' : ''}`}
                onClick={() => setAttachMenuOpen((open) => !open)}
                title={t('hero.attachMenuAria')}
                aria-label={t('hero.attachMenuAria')}
                aria-expanded={attachMenuOpen}
                aria-haspopup="menu"
                disabled={sending || attachments.length >= MAX_COMPOSER_ATTACHMENTS}
              >
                <PixelIcon name="plus" size={15} />
              </button>
              {attachMenuOpen && !sending ? (
                <div className="prompt-attach-menu" role="menu" aria-label={t('hero.attachMenu')} ref={attachPanelRef}>
                  <button
                    type="button"
                    className="prompt-attach-item"
                    role="menuitem"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <PixelIcon name="image" size={16} /> {t('hero.uploadImage')}
                  </button>
                  <button
                    type="button"
                    className="prompt-attach-item"
                    role="menuitem"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      setIsSketchOpen(true);
                    }}
                  >
                    <PixelIcon name="palette" size={16} /> {t('hero.drawSketch')}
                  </button>
                </div>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden-file-input"
                onChange={(event) => {
                  if (event.target.files && event.target.files.length > 0) {
                    handleAttachFiles(event.target.files);
                    event.target.value = '';
                  }
                }}
              />
            </div>
            {builderControls}
          </div>
          <div className="status-composer-toolbar-right">
            {sending && !showStop ? (
              <span className="status-feedback-sending" role="status">
                {t('statusView.feedback.sending')}
              </span>
            ) : null}
            {showStop ? (
              <button
                type="button"
                className="status-composer-stop"
                onClick={() => void stopAndSwitchToSelf()}
                aria-label={t('statusView.feedback.stopTitle')}
                title={t('statusView.feedback.stopTitle')}
              >
                <PixelIcon name="stop" size={13} />
              </button>
            ) : stopRequested ? null : (
              <button
                type="button"
                className="primary-btn status-composer-send"
                onClick={() => void send()}
                disabled={sending || trimmed.length < 10 || pendingAttachmentReads > 0}
                aria-label={sending ? t('statusView.feedback.sending') : t('statusView.feedback.submit')}
                title={sending ? t('statusView.feedback.sending') : t('statusView.feedback.submit')}
              >
                {sending ? (
                  <span className="status-composer-send-spinner" aria-hidden="true" />
                ) : (
                  <PixelIcon name="arrowRight" size={13} />
                )}
              </button>
            )}
          </div>
        </div>
        {/* Sending's indicator now sits inline next to Send, above */}
        {error || notice ? (
          <div className="status-feedback-actions">
            {error ? <p className="error">{error}</p> : <p className="status-feedback-notice">{notice}</p>}
          </div>
        ) : null}
        <SketchModal isOpen={isSketchOpen} onClose={() => setIsSketchOpen(false)} onSaveSketch={handleSaveSketch} />
      </div>
    );
  }

  return (
    <div className="status-feedback status-composer">
      <h3 className="status-feedback-title">{t(titleKey)}</h3>
      <p className="status-feedback-hint">{t(hintKey)}</p>
      {builderSelector ? <div className="builder-mode-row">{builderControls}</div> : null}
      {routeNoteKey && state !== 'sent' && !error && !notice ? (
        <p className="status-feedback-route">{t(routeNoteKey)}</p>
      ) : null}
      {failureReason === 'gate_red' && !quickActionDismissed && state !== 'sending' ? (
        <div className="status-feedback-quick-actions">
          <button type="button" className="status-feedback-quick-action" onClick={sendDebugCi}>
            <PixelIcon name="wrench" size={12} />
            {t('statusView.feedback.debugCi')}
          </button>
        </div>
      ) : null}
      <textarea
        className="status-feedback-input"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (state === 'sent') setState('idle');
        }}
        placeholder={t('statusView.feedback.placeholder')}
        rows={3}
        maxLength={2000}
      />
      <div className="status-feedback-actions">
        <button
          className="primary-btn"
          onClick={() => void send()}
          disabled={state === 'sending' || trimmed.length < 10}
        >
          {state === 'sending' ? t('statusView.feedback.sending') : t('statusView.feedback.submit')}
        </button>
        {sentReceipt}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {notice && !error ? <p className="status-feedback-notice">{notice}</p> : null}
    </div>
  );
}

/**
 * The thread, in the shape a conversation actually has.
 *
 * The build's story used to be a log: a bordered box titled BUILD ACTIVITY, rows of
 * 12px text behind an icon column, timestamps hard right. Everything in it was true and
 * none of it read as somebody talking. Here the agent's turns are ordinary prose at full
 * width with nothing drawn around them, and the creator's are quiet bubbles on the other
 * side — the asymmetry every chat client uses, and deliberately the way round where the
 * agent's words are the ones with room to breathe.
 *
 * Scrolls in its own pane so the composer beneath it never moves, and sticks to the
 * bottom as the agent talks — unless the reader has scrolled up, which is them saying
 * they are reading something and would like it to stay put.
 */
type ThreadWorkingState = {
  /** Coarse phase — "Writing code" / "Starting agent". */
  label: string;
  /** Fresh ambient presence thought, when one is flashing. */
  thoughtLabel: string | null;
  thoughtKey: string | null;
  thoughtAt: number | null;
  heartbeatAt: number | null;
};

function ThreadStream({
  token,
  entries,
  emptyLabel,
  priorRounds,
  priorSlug,
  after,
  working = null,
  stickNonce = 0,
}: {
  token: string;
  entries: ActivityEntry[];
  emptyLabel: string;
  /** Superseded jobs on this game — collapsed above the live turns. */
  priorRounds?: PriorRoundHistory[];
  priorSlug?: string;
  /** Renders inside the scroller after the turns — tall surfaces (connect card) belong
   *  here, not in the pinned foot, or a phone has no room left for the conversation. */
  after?: ReactNode;
  /**
   * Live agent work — last row in the transcript (Claude-shaped), not a foot caption.
   * Pulses while the agent is mid-build; cleared the moment work is no longer active.
   */
  working?: ThreadWorkingState | null;
  /** Bump when `after` / `working` appears so a stick-to-bottom reader still sees it. */
  stickNonce?: number;
}) {
  const { t, i18n } = useTranslation();
  const [zoomed, setZoomed] = useState<BuildMediaItem | null>(null);
  const [broken, setBroken] = useState<string[]>([]);
  const [, setThoughtTick] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const onScroll = () => {
    const pane = scrollRef.current;
    if (!pane) return;
    // Content end, not the runway pad.
    stickToBottomRef.current = studioThreadNearContentEnd(pane);
  };

  useEffect(() => {
    const pane = scrollRef.current;
    if (!pane || !stickToBottomRef.current) return;
    // Do not scroll into the Claude/Cursor runway.
    pane.scrollTop = studioThreadContentScrollTop(pane);
  }, [entries.length, stickNonce, working?.label, working?.thoughtLabel]);

  // Presence ages out client-side; one timeout at expiry so the working line falls
  // back to the coarse phase without waiting on the next status poll.
  useEffect(() => {
    if (!working?.thoughtAt || !working.thoughtLabel) return;
    const remaining = working.thoughtAt + PRESENCE_THOUGHT_MS - Date.now();
    if (remaining <= 0) {
      setThoughtTick((n) => n + 1);
      return;
    }
    const id = window.setTimeout(() => setThoughtTick((n) => n + 1), remaining);
    return () => window.clearTimeout(id);
  }, [working?.thoughtAt, working?.thoughtLabel]);

  const thoughtFresh =
    working?.thoughtAt != null &&
    working.thoughtLabel != null &&
    working.thoughtLabel.length > 0 &&
    Date.now() - working.thoughtAt <= PRESENCE_THOUGHT_MS;
  const workingHeadline = thoughtFresh && working?.thoughtLabel ? working.thoughtLabel : working?.label;

  return (
    <div className="studio-thread-scroll" ref={scrollRef} onScroll={onScroll}>
      {/* Short threads sit above the composer, not under the lid. */}
      <div className="studio-thread-scroll-body">
        {priorSlug && priorRounds && priorRounds.length > 0 ? (
          <StudioPriorRounds slug={priorSlug} rounds={priorRounds} />
        ) : null}
        {entries.length === 0 && !working ? <p className="studio-thread-empty">{emptyLabel}</p> : null}
        <ol className="studio-thread-turns">
          {entries.map((entry, index) => {
            const mine = entry.kind === 'revision';
            const isStudioVoice = entry.kind === 'studio';
            const media = entry.media?.filter((item) => !broken.includes(item.ref)) ?? [];
            return (
              <li
                key={`${entry.kind}-${entry.at}-${index}`}
                className={`studio-turn${mine ? ' is-mine' : ''}${isStudioVoice ? ' is-studio-voice' : ''}${entry.pending ? ' is-pending' : ''}`}
              >
                <div className="studio-turn-body">
                  {/* The step is a closed set, so it is our own translated copy rather than
                      a machine translation of whatever the agent happened to write. */}
                  {!mine && entry.step ? (
                    <span className="studio-turn-kicker">{t(`statusView.progress.steps.${entry.step}`)}</span>
                  ) : null}
                  {/* A relayed request wears its provenance. Unlabelled, an agent's own
                      summary of a chat held elsewhere reads as words the creator typed. */}
                  {mine && entry.relayed ? (
                    <span className="studio-turn-kicker">{t('statusView.progress.relayedRequest')}</span>
                  ) : null}
                  {entry.kind === 'studio' ? (
                    <span className="studio-turn-kicker studio-turn-kicker-studio">
                      {t('statusView.progress.studioVoice')}
                    </span>
                  ) : null}
                  <p className="studio-turn-text">{entry.text}</p>
                  {media.length > 0 ? (
                    <span className="studio-turn-shots">
                      {media.map((item) => (
                        <button
                          key={item.ref}
                          type="button"
                          className="build-activity-shot"
                          onClick={() => setZoomed(item)}
                          title={t('statusView.gallery.expand')}
                        >
                          <img
                            src={buildMediaUrl(token, item)}
                            alt={item.label || t('statusView.gallery.alt')}
                            loading="lazy"
                            onError={() => setBroken((refs) => [...refs, item.ref])}
                          />
                        </button>
                      ))}
                    </span>
                  ) : null}
                </div>
                <time className="studio-turn-time" dateTime={new Date(entry.at).toISOString()}>
                  {entry.pending ? (
                    t('statusView.progress.yourRequestSending')
                  ) : mine && entry.delivered !== undefined ? (
                    <>
                      <span className={`studio-turn-delivery${entry.delivered ? ' is-delivered' : ' is-queued'}`}>
                        {t(
                          entry.delivered
                            ? 'statusView.progress.yourRequestDelivered'
                            : 'statusView.progress.yourRequestQueued',
                        )}
                      </span>
                      {' · '}
                      {formatRelativeTime(entry.at, i18n.language)}
                    </>
                  ) : (
                    formatRelativeTime(entry.at, i18n.language)
                  )}
                </time>
              </li>
            );
          })}
          {working && workingHeadline ? (
            <li className={`studio-turn is-working${thoughtFresh ? ' is-thought' : ''}`} aria-live="polite">
              <div
                className="studio-turn-working"
                key={
                  thoughtFresh && working.thoughtKey
                    ? `thought:${working.thoughtKey}:${working.thoughtAt}`
                    : `phase:${working.label}`
                }
              >
                <span className="studio-turn-working-pulse" aria-hidden="true" />
                <span className="studio-turn-working-label">{workingHeadline}</span>
              </div>
              {working.heartbeatAt !== null ? (
                <span className="studio-turn-time">
                  <BuildHeartbeat at={working.heartbeatAt} />
                </span>
              ) : null}
            </li>
          ) : null}
        </ol>
        {after}
      </div>
      {/* Runway under turns — stick targets body end, not this pad. */}
      <div className="studio-thread-scroll-pad" aria-hidden="true" />
      {zoomed ? <ShotLightbox token={token} item={zoomed} onClose={() => setZoomed(null)} /> : null}
    </div>
  );
}

/**
 * The bar between the thread and the composer: where the work is, and the one thing to
 * do about it.
 *
 * Replaces a five-step timeline, a progress bar, a status pill and a sentence — four
 * things saying where the build was, stacked above the conversation and pushing it down
 * the page. This says it once, in the place the eye already is because the composer is
 * directly underneath.
 */
function ThreadContextBar({
  phase,
  thought,
  heartbeatAt,
  progress,
  primary,
  active = false,
}: {
  phase: string;
  /** Fresh MCP presence thought — replaces the coarse phase as a short headline flash. */
  thought?: { key: string; at: number } | null;
  heartbeatAt: number | null;
  progress?: { done: number; total: number };
  primary?: { label: string; onClick: () => void };
  /** Agent is mid-build — show motion so "Writing code" does not read as stuck text. */
  active?: boolean;
}) {
  const { t } = useTranslation();
  const [, setTick] = useState(0);

  // Presence ages out client-side; one timeout at expiry so the headline falls back
  // without a status poll — and without a lingering interval after the flash ends.
  useEffect(() => {
    if (!thought) return;
    const remaining = thought.at + PRESENCE_THOUGHT_MS - Date.now();
    if (remaining <= 0) {
      setTick((n) => n + 1);
      return;
    }
    const id = window.setTimeout(() => setTick((n) => n + 1), remaining);
    return () => window.clearTimeout(id);
  }, [thought]);

  const thoughtFresh = thought !== null && thought !== undefined && Date.now() - thought.at <= PRESENCE_THOUGHT_MS;
  const thoughtLabel =
    thoughtFresh && thought
      ? t(`statusView.presence.${thought.key}`, {
          defaultValue: '',
        })
      : '';
  const headline = thoughtLabel || phase;
  const showingThought = Boolean(thoughtLabel);

  return (
    <div className={`studio-thread-context${active ? ' is-active' : ''}${showingThought ? ' is-thought' : ''}`}>
      <span className="studio-context-state">
        <span
          className="studio-context-phase"
          key={showingThought ? `thought:${thought!.key}:${thought!.at}` : `phase:${phase}`}
        >
          {active ? <span className="studio-context-phase-spinner" aria-hidden="true" /> : null}
          {headline}
        </span>
        {heartbeatAt !== null ? (
          <span className="studio-context-beat">
            <BuildHeartbeat at={heartbeatAt} />
          </span>
        ) : null}
      </span>
      <span className="studio-context-actions">
        {progress && progress.total > 0 ? (
          <span className="studio-context-progress">
            {t('statusView.progress.checklistCount', { done: progress.done, total: progress.total })}
          </span>
        ) : null}
        {primary ? (
          <button type="button" className="primary-btn status-play-cta" onClick={primary.onClick}>
            <PixelIcon name="play" size={13} /> {primary.label}
          </button>
        ) : null}
      </span>
    </div>
  );
}

/**
 * One entry in the build story. Agent commits and the creator's own change requests
 * are interleaved on a single timeline: a creator needs to see that what they asked
 * for went in, and *when* — a bare list of commit subjects reads as an unmoving wall.
 */
/** After this much silence from the agent, the page explains the gap. */
const QUIET_BUILD_MS = 15 * 60_000;

type ActivityEntry = {
  // 'studio': the chat agent's own turn — a third voice, not is-mine.
  kind: 'commit' | 'revision' | 'event' | 'media' | 'studio';
  text: string;
  at: number;
  /** Sent from this tab but not yet echoed back by the API. */
  pending?: boolean;
  /** For agent events: the step it reported, rendered from our own translations. */
  step?: BuildStep;
  eventKind?: BuildEventKind;
  /**
   * For revisions: set when an agent wrote the request on the creator's behalf. The row
   * stays on the creator's side of the thread — it is still their request — but says so
   * rather than passing an agent's summary off as something the creator typed.
   */
  relayed?: boolean;
  // Whether the agent has picked this message up from its inbox yet.
  delivered?: boolean;
  /** Pictures shown as thumbnails on this row, expandable to full size. */
  media?: BuildMediaItem[];
};

/** Icon per feed entry. Agent events say what kind of moment they are. */
const EVENT_ICONS: Record<BuildEventKind, PixelIconName> = {
  step: 'wrench',
  milestone: 'star',
  asking: 'pencil',
  blocked: 'bolt',
  done: 'check',
};

/**
 * Places the build's pictures on the timeline.
 *
 * A screenshot the agent pushed is a moment, so it gets its own row at the time it
 * was taken. The captures committed on the branch are not moments — they are one set
 * describing how the game looks at its latest commit — so they share a single row,
 * dated to that commit rather than scattered across the feed at identical times.
 */
function mediaEntries(media: BuildMediaItem[], commitTime: number, caption: string): ActivityEntry[] {
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

function buildActivityFeed(
  progress: BuildProgress | undefined,
  events: BuildEvent[],
  pendingRevisions: PendingRevision[],
  media: BuildMediaItem[],
  mediaCaption: string,
): ActivityEntry[] {
  // Branch captures belong at the commit that carries them; without commits the best
  // available answer is "now", which keeps them at the top where they are useful.
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

  // Oldest first, because this is a conversation and that is the order conversations
  // are read in: the newest thing sits at the bottom, next to the box you reply in.
  // It used to be newest-first, which put the creator's own last message at the top,
  // furthest from the composer, and made the thread read backwards once it had more
  // than a couple of entries in it.
  return entries.filter((entry) => Number.isFinite(entry.at)).sort((a, b) => a.at - b.at);
}

function BuildProgressPanel({
  token,
  progress,
  events,
  media,
  pendingRevisions,
}: {
  token: string;
  progress?: BuildProgress;
  events: BuildEvent[];
  media: BuildMediaItem[];
  pendingRevisions: PendingRevision[];
}) {
  const { t, i18n } = useTranslation();
  // A capture can vanish between the poll that listed it and the request for its
  // bytes — the agent force-pushes its branch mid-build — so a picture that fails to
  // load is dropped rather than left as a broken frame.
  const [broken, setBroken] = useState<string[]>([]);
  const [zoomed, setZoomed] = useState<BuildMediaItem | null>(null);
  const shownMedia = media.filter((item) => !broken.includes(item.ref));
  const activity = buildActivityFeed(progress, events, pendingRevisions, shownMedia, t('statusView.gallery.caption'));
  const checklist = progress?.checklist ?? [];
  // The agent's own latest word, in order of directness: an event it pushed over the
  // build channel, then the journal it committed, then nothing.
  const latestEvent = events[0];
  const headline = latestEvent?.text ?? progress?.note;

  if (checklist.length === 0 && activity.length === 0 && !headline) {
    return null;
  }

  // A count the agent reported beats one we infer from ticked checkboxes.
  const reportedProgress = events.find((event) => event.progress)?.progress;
  const doneCount = reportedProgress?.done ?? checklist.filter((item) => item.checked).length;
  const totalCount = reportedProgress?.total ?? checklist.length;
  const donePercent = totalCount === 0 ? 0 : (doneCount / totalCount) * 100;
  // What the agent says it is doing beats what we infer from its checklist — fall
  // back to the first unfinished task only when it has written nothing.
  const currentStep = headline ? undefined : checklist.find((item) => !item.checked);
  const lastUpdate = activity[activity.length - 1];
  // A long gap between pushes is normal, but silence with no explanation reads as
  // "it's broken" — say so plainly instead of letting the creator guess.
  const isQuiet = lastUpdate !== undefined && Date.now() - lastUpdate.at > QUIET_BUILD_MS;

  return (
    <div className="build-progress">
      {headline ? (
        <p className="build-progress-note" aria-live="polite">
          <span className="build-progress-note-label">
            {latestEvent?.step
              ? t(`statusView.progress.steps.${latestEvent.step}`)
              : t('statusView.progress.agentSays')}
          </span>
          <span className="build-progress-note-text">{headline}</span>
        </p>
      ) : null}

      {totalCount > 0 ? (
        <div className="build-progress-checklist">
          <div className="build-progress-heading-row">
            <h3 className="build-progress-heading">{t('statusView.progress.checklistTitle')}</h3>
            <span className="build-progress-count">
              {t('statusView.progress.checklistCount', { done: doneCount, total: totalCount })}
            </span>
          </div>
          <div
            className="build-progress-bar"
            role="progressbar"
            aria-valuenow={doneCount}
            aria-valuemin={0}
            aria-valuemax={totalCount}
          >
            <div className="build-progress-bar-fill" style={{ width: `${donePercent}%` }} />
          </div>
          {currentStep ? (
            <p className="build-progress-current">
              <span className="build-progress-current-spinner" aria-hidden="true" />
              {t('statusView.progress.currentStep', { step: currentStep.text })}
            </p>
          ) : null}
          <ul>
            {checklist.map((item, index) => (
              <li key={index} className={item.checked ? 'checklist-done' : 'checklist-pending'}>
                <span aria-hidden="true">
                  <PixelIcon name={item.checked ? 'check' : 'checkbox'} size={12} />
                </span>{' '}
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {activity.length > 0 ? (
        <div className="build-progress-commits">
          <div className="build-progress-heading-row">
            <h3 className="build-progress-heading">{t('statusView.progress.activityTitle')}</h3>
            {lastUpdate ? (
              <span className="build-progress-count">
                {t('statusView.progress.lastUpdate', {
                  time: formatRelativeTime(lastUpdate.at, i18n.language),
                })}
              </span>
            ) : null}
          </div>
          {isQuiet ? <p className="build-progress-quiet">{t('statusView.progress.quietHint')}</p> : null}
          <ul className="build-activity-list">
            {activity.map((entry, index) => (
              <li
                key={`${entry.kind}-${entry.at}-${index}`}
                className={[
                  'build-activity-item',
                  `build-activity-${entry.kind}`,
                  // The creator's own messages sit on the other side of the thread, the
                  // way they do in any conversation — without it, a request they sent and
                  // the agent's reply to it are two identical grey rows.
                  entry.kind === 'revision' ? 'is-mine' : '',
                  index === activity.length - 1 ? 'build-progress-commit-latest' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="build-activity-icon" aria-hidden="true">
                  <PixelIcon
                    name={
                      entry.kind === 'revision'
                        ? 'pencil'
                        : entry.kind === 'media'
                          ? 'eye'
                          : entry.kind === 'studio'
                            ? 'sparkle'
                            : entry.kind === 'event'
                              ? EVENT_ICONS[entry.eventKind ?? 'step']
                              : 'wrench'
                    }
                    size={12}
                  />
                </span>
                <span className="build-activity-body">
                  {entry.kind === 'revision' ? (
                    <span className="build-activity-label">
                      {entry.pending
                        ? t('statusView.progress.yourRequestSending')
                        : entry.relayed
                          ? t('statusView.progress.relayedRequest')
                          : t('statusView.progress.yourRequest')}
                    </span>
                  ) : entry.kind === 'studio' ? (
                    <span className="build-activity-label">{t('statusView.progress.studioVoice')}</span>
                  ) : entry.step ? (
                    // The step is a closed set, so it is real translated copy rather
                    // than a machine translation of whatever the agent happened to write.
                    <span className="build-activity-label">{t(`statusView.progress.steps.${entry.step}`)}</span>
                  ) : null}
                  <span className="build-activity-text">{entry.text}</span>
                  {entry.media ? (
                    <span className="build-activity-shots">
                      {entry.media.map((item) => (
                        <button
                          key={item.ref}
                          type="button"
                          className="build-activity-shot"
                          onClick={() => setZoomed(item)}
                          title={t('statusView.gallery.expand')}
                        >
                          <img
                            src={buildMediaUrl(token, item)}
                            alt={item.label || t('statusView.gallery.alt')}
                            loading="lazy"
                            onError={() => setBroken((refs) => [...refs, item.ref])}
                          />
                        </button>
                      ))}
                    </span>
                  ) : null}
                </span>
                <time className="build-activity-time" dateTime={new Date(entry.at).toISOString()}>
                  {entry.pending ? '' : formatRelativeTime(entry.at, i18n.language)}
                </time>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {zoomed ? <ShotLightbox token={token} item={zoomed} onClose={() => setZoomed(null)} /> : null}
    </div>
  );
}
