import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { latestAgentActivityAt } from '../../agentActivity.js';
import { readStorageItem, writeStorageItem } from '../../core/persistence.js';
import { defaultBuilderFor, isBuilderKind, type BuilderKind } from '../../builderKind.js';
import { GameTheater } from '../../GameTheater.js';
import { PixelIcon, type PixelIconName } from '../../PixelIcon.js';
import {
  getChannelPlayable,
  getSubmissionPreview,
  handoffToPlatform,
  handoffToSelf,
  type BuildPlayableItem,
  type SubmissionApiError,
  type SubmissionPreview,
  type SubmissionStatus,
} from '../../submissionApi.js';
import { NAVIGATE_EVENT, statusPath, studioPath } from '../../core/router.js';
import { connectCardMode, selfStatusCopy, shouldShowConnectCard } from '../../selfBuildCopy.js';
import { StudioConnectCard } from './StudioConnectCard.js';
import { pollDelayMs } from './studioStatusPoll.js';
import { pokeStudioStatus, subscribeStudioStatus } from './studioStatusStore.js';
import { recordStudioStep, type StudioStepDetail } from '../../visitTelemetry.js';
import '../../build-progress.css';
import './status-header.css';
import './status-timeline.css';
import './status-play-card.css';
import './status-thread.css';
import { FeedbackPanel } from './FeedbackPanel.js';
import { BuildProgressPanel } from './BuildProgressPanel.js';
import { buildActivityFeed, type PendingRevision } from './buildActivityFeed.js';
import { BuildHeartbeat } from './BuildHeartbeat.js';
import { presenceThought } from './presenceThought.js';
import { ThreadStream } from './ThreadStream.js';
import { ThreadContextBar } from './ThreadContextBar.js';
import { AbandonControl } from './AbandonControl.js';
import { PlayCard } from './PlayCard.js';

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
  // The newest preview key wanted while an older fetch is in flight.
  const pendingPreviewKeyRef = useRef<string | null>(null);
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
    pendingPreviewKeyRef.current = null;
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
    if (!previewSlug) return;
    if (headSha && previewKey === loadedPreviewShaRef.current) return;
    // Without a headSha we can't tell if there's anything new — only load once.
    if (!headSha && loadedPreviewShaRef.current !== null) return;
    // Set even mid-fetch — `finally` below checks back, so nothing is dropped.
    pendingPreviewKeyRef.current = previewKey;
    if (previewInFlightRef.current) return;

    const load = (key: string) => {
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
          loadedPreviewShaRef.current = key;
        })
        .catch((err: unknown) => {
          const apiError = err as SubmissionApiError;
          // On a refresh failure, keep showing the last-good preview rather than clearing it.
          if (!isRefresh) {
            setPreview(null);
          }
          loadedPreviewShaRef.current = key;
          setPreviewError(apiError.status === 409 ? t('statusView.previewNotReady') : t('statusView.previewError'));
        })
        .finally(() => {
          previewInFlightRef.current = false;
          setPreviewLoading(false);
          setPreviewRefreshing(false);
          // Retry only a genuinely newer key — not this one again after a failure.
          const pending = pendingPreviewKeyRef.current;
          if (pending && pending !== key) load(pending);
        });
    };

    load(previewKey);
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
          // Retry only a genuinely newer ref — not this one again after a failure.
          const pending = pendingChannelItemRef.current;
          if (pending && pending.ref !== item.ref) load(pending);
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
