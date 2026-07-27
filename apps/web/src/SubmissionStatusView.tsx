import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GameFrame } from './GameFrame.js';
import { GameTheater } from './GameTheater.js';
import { PixelIcon, type PixelIconName } from './PixelIcon.js';
import {
  abandonSubmission,
  getBuildStats,
  getSubmissionPreview,
  getSubmissionStatus,
  submitFeedback,
  buildMediaUrl,
  buildPlayableUrl,
  type BuildEvent,
  type BuildMediaItem,
  type BuildPlayableItem,
  type BuildEventKind,
  type BuildProgress,
  type BuildStep,
  type SubmissionApiError,
  type SubmissionPreview,
  type SubmissionStatus,
} from './submissionApi.js';
import { draftPath, playPath, statusPath } from './router.js';
import { formatDuration, formatRelativeTime } from './relativeTime.js';

const TERMINAL_STATUSES = new Set<SubmissionStatus['status']>(['published', 'needs_changes', 'abandoned']);
/** Statuses that halt the linear timeline rather than sitting on a step of it. */
const HALTED_STATUSES = new Set<SubmissionStatus['status']>(['needs_changes', 'abandoned']);
// The agent is actively working during these — poll tightly so progress feels live.
// Everything else (queued/publishing) changes slowly, so poll gently.
const ACTIVE_BUILD_STATUSES = new Set<SubmissionStatus['status']>(['building', 'in_review']);
/** Exported so tests advance timers by the real cadence instead of a magic number. */
export const ACTIVE_POLL_MS = 3000;
const IDLE_POLL_MS = 10000;

function pollDelayMs(status: SubmissionStatus['status']): number | null {
  if (TERMINAL_STATUSES.has(status)) return null;
  return ACTIVE_BUILD_STATUSES.has(status) ? ACTIVE_POLL_MS : IDLE_POLL_MS;
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

/**
 * Ticking "in progress for 2m 14s" readout. The submission time only exists in
 * localStorage (the API doesn't return it), so this is hidden when the link is
 * opened on a device that didn't submit it.
 */
function ElapsedTimer({ since, running }: { since: number; running: boolean }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  return <span className="status-elapsed">{t('statusView.elapsed', { duration: formatDuration(now - since) })}</span>;
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

type SubmissionStatusViewProps = {
  token: string;
  submittedTitle?: string;
  submittedConcept?: string;
  submittedAt?: number;
  trackingUrl?: string;
  /** Sends the creator home with this idea loaded, ready to edit and resubmit. */
  onRetry?: (concept: string) => void;
};

export function SubmissionStatusView({
  token,
  submittedTitle,
  submittedConcept,
  submittedAt,
  trackingUrl,
  onRetry,
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

  // Which game (if any) is open in the full-viewport theater. The draft's HTML is
  // snapshotted at launch (`launchedHtml`) so a background refresh doesn't reload
  // the game out from under the player mid-session — reopening picks up the latest.
  const [playing, setPlaying] = useState<'draft' | 'published' | null>(null);
  const [launchedHtml, setLaunchedHtml] = useState<string | null>(null);

  // Tracks the PR head SHA the currently-displayed preview was built from, so we
  // only re-fetch (and reload the iframe) when the agent has actually pushed new
  // work — not on every status poll.
  const loadedPreviewShaRef = useRef<string | null>(null);
  const previewInFlightRef = useRef(false);

  const currentTrackingUrl = useMemo(
    () => trackingUrl ?? new URL(statusPath(token), window.location.href).toString(),
    [token, trackingUrl],
  );

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

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
    loadedPreviewShaRef.current = null;
    previewInFlightRef.current = false;

    const stopPolling = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const scheduleNext = (nextStatus: SubmissionStatus['status']) => {
      const delay = pollDelayMs(nextStatus);
      if (delay === null || cancelled) return;
      timeoutId = window.setTimeout(() => {
        void poll();
      }, delay);
    };

    const poll = async () => {
      try {
        const nextStatus = await getSubmissionStatus(token, i18n.language);
        if (cancelled) return;

        setStatus(nextStatus);
        setLoading(false);
        setErrorMessage(null);
        setIsInvalidToken(false);
        scheduleNext(nextStatus.status);
      } catch (err) {
        if (cancelled) return;

        const apiError = err as SubmissionApiError;
        setStatus(null);
        setLoading(false);
        setIsInvalidToken(apiError.status === 400);
        setErrorMessage(
          apiError.status === 400 ? t('statusView.invalidToken') : apiError.message || t('errors.generic'),
        );

        if (apiError.status !== 400) {
          // Transient failure (network blip, rate limit) — keep trying at the idle cadence.
          scheduleNext('queued');
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      stopPolling();
    };
    // i18n.language is a dependency because the API localizes the build log for us.
  }, [i18n.language, t, token]);

  const publishedGameTitle = submittedTitle ?? status?.slug ?? t('statusView.publishedGameTitle');

  // The link to hand to someone else. Deliberately *not* the tracking URL: that one
  // carries the status token, which grants change requests and spends the creator's
  // quota. A slug link is watch-only, and survives the game being published.
  const shareUrl = useMemo(() => {
    const slug = status?.slug ?? status?.preview?.slug;
    if (!slug) return null;
    const path = status?.status === 'published' ? playPath(slug) : draftPath(slug);
    return new URL(path, window.location.href).toString();
  }, [status?.slug, status?.preview?.slug, status?.status]);

  // Auto-load the live preview as soon as one is available, and silently refresh it
  // whenever the agent pushes a new commit (headSha changes) — no click required.
  useEffect(() => {
    const previewSlug = status?.preview?.slug;
    const headSha = status?.progress?.headSha;
    if (!previewSlug || previewInFlightRef.current) return;
    if (headSha && headSha === loadedPreviewShaRef.current) return;
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
        loadedPreviewShaRef.current = headSha ?? 'unknown';
      })
      .catch((err: unknown) => {
        const apiError = err as SubmissionApiError;
        // On a refresh failure, keep showing the last-good preview rather than clearing it.
        if (!isRefresh) {
          setPreview(null);
        }
        setPreviewError(apiError.status === 409 ? t('statusView.previewNotReady') : t('statusView.previewError'));
      })
      .finally(() => {
        previewInFlightRef.current = false;
        setPreviewLoading(false);
        setPreviewRefreshing(false);
      });
  }, [status?.preview?.slug, status?.progress?.headSha, t, token]);

  const previewTitle = preview?.title ?? submittedTitle ?? status?.preview?.slug ?? t('statusView.previewGameTitle');

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
  const closeTheater = () => {
    setPlaying(null);
    setLaunchedHtml(null);
  };

  return (
    <>
      <section className="panel status-panel">
        <div className="status-heading">
          <h2 className="section-title">{submittedTitle ?? t('statusView.title')}</h2>
          {status && !TERMINAL_STATUSES.has(status.status) ? (
            <span className="status-live">
              <span className="live-dot" aria-hidden="true" />
              {t('statusView.live')}
              {submittedAt ? (
                <>
                  {' · '}
                  <ElapsedTimer since={submittedAt} running />
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
        {shareUrl ? <ShareLink url={shareUrl} /> : null}

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
              {t(`statusView.states.${status.status}.description`)}
            </p>

            {!TERMINAL_STATUSES.has(status.status) ? <BuildEta submittedAt={submittedAt} /> : null}

            {status.progress?.checks === 'FAILURE' ? (
              <p className="status-warning">
                <PixelIcon name="signal" size={13} /> {t('statusView.checksFailed')}
              </p>
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
              />
            ) : previewLoading ? (
              <p className="status-preview-pending">
                <span className="status-preview-spinner" aria-hidden="true" /> {t('statusView.previewLoading')}
              </p>
            ) : null}

            {/* Order matters: "played it — want changes?" follows straight on from the
                play card, so the ask lands while the game is still in mind. The build
                log is reference material and sits underneath.

                This used to wait for a preview, which waits for a pull request — so the
                first stretch of the build, when redirecting the agent is cheapest and the
                creator is most likely to spot a misreading of their idea, was the one
                stretch they could not say anything. The agent picks messages up off the
                channel on its next report, so a note left now lands in a minute or two. */}
            {status.status !== 'published' && status.status !== 'abandoned' ? (
              <FeedbackPanel
                token={token}
                building={!preview}
                onSent={(text) => setPendingRevisions((current) => [...current, { text, at: Date.now() }])}
              />
            ) : null}

            {/* Above the feed on purpose: a playable build outranks any description of
                one, and it is available minutes before the first commit. */}
            <PlayableBuildPanel token={token} playable={status.playable ?? []} />

            <BuildProgressPanel
              token={token}
              progress={status.progress}
              events={status.events ?? []}
              media={status.media ?? []}
              pendingRevisions={pendingRevisions}
            />

            {previewError && !preview ? <p className="error">{previewError}</p> : null}

            <div className="status-footer-actions">
              <a className="inline-link" href="/">
                {t('statusView.backHome')}
              </a>
              {!TERMINAL_STATUSES.has(status.status) ? <AbandonControl token={token} /> : null}
            </div>
          </>
        ) : null}
      </section>

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
          title={previewTitle}
          badge={{ icon: 'wrench', label: t('statusView.draftBadge') }}
          source={{ html: launchedHtml }}
          onExit={closeTheater}
        />
      ) : null}
    </>
  );
}

/**
 * "Most games are ready in about N minutes" — measured from recently published
 * games, not invented. Once the build is past that estimate it switches to a
 * gentler line rather than silently going stale, which is the moment creators
 * otherwise assume something broke.
 */
function BuildEta({ submittedAt }: { submittedAt?: number }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<{ medianMinutes: number | null; sampleSize: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBuildStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {
        // No stats is not an error — the fallback copy covers it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Three builds is the point where a median says more than it misleads.
  const median = stats && stats.sampleSize >= 3 ? stats.medianMinutes : null;
  if (median === null) {
    return <p className="status-eta">{t('statusView.eta.unknown')}</p>;
  }

  const elapsedMinutes = submittedAt ? (Date.now() - submittedAt) / 60_000 : 0;
  return (
    <p className="status-eta">
      {elapsedMinutes > median
        ? t('statusView.eta.overrun', { minutes: median })
        : t('statusView.eta.typical', { minutes: median })}
    </p>
  );
}

/**
 * Stops the build for good. Two-step by design: the first click only arms it, so a
 * mis-tap can't throw away an hour of agent work. Deliberately understated — it is
 * an escape hatch, not something to invite.
 */
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
      <button type="button" className="status-abandon" onClick={() => setArmed(true)}>
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

/** Watch-only link to the game, with one-tap copy (the point is to send it to someone). */
function ShareLink({ url }: { url: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission (or no clipboard API) — the link is right there to
      // select by hand, so this needs no error state.
    }
  };

  return (
    <p className="status-note status-share">
      {t('statusView.shareLink')}{' '}
      <a className="inline-link" href={url}>
        {url}
      </a>
      <button type="button" className="status-share-copy" onClick={() => void copy()}>
        <PixelIcon name={copied ? 'check' : 'globe'} size={12} />{' '}
        {copied ? t('statusView.shareCopied') : t('statusView.shareCopy')}
      </button>
    </p>
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
}: {
  badge: ReactNode;
  badgeClass?: string;
  title: string;
  subtitle?: string;
  cta: string;
  onPlay: () => void;
}) {
  return (
    <div className="status-play-card">
      <div className="status-play-card-info">
        <span className={badgeClass ? `status-play-badge ${badgeClass}` : 'status-play-badge'}>{badge}</span>
        <h3 className="status-play-card-title">{title}</h3>
        {subtitle ? <p className="status-play-card-sub">{subtitle}</p> : null}
      </div>
      <button className="primary-btn status-play-cta" onClick={onPlay}>
        <PixelIcon name="play" size={13} /> {cta}
      </button>
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
  building,
  onSent,
}: {
  token: string;
  building: boolean;
  onSent: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();

  const send = async () => {
    if (trimmed.length < 10) return;
    setState('sending');
    setError(null);
    try {
      await submitFeedback(token, trimmed);
      setState('sent');
      setText('');
      // Echo it into the activity feed straight away: the API only sees it once the
      // comment round-trips through GitHub, which is a poll or two away.
      onSent(trimmed);
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

  return (
    <div className="status-feedback">
      <h3 className="status-feedback-title">
        {t(building ? 'statusView.feedback.titleBuilding' : 'statusView.feedback.title')}
      </h3>
      <p className="status-feedback-hint">
        {t(building ? 'statusView.feedback.hintBuilding' : 'statusView.feedback.hint')}
      </p>
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
        {state === 'sent' ? (
          <span className="status-feedback-sent">
            <PixelIcon name="check" size={13} /> {t('statusView.feedback.sent')}
          </span>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
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
  kind: 'commit' | 'revision' | 'event' | 'media';
  text: string;
  at: number;
  /** Sent from this tab but not yet echoed back by the API. */
  pending?: boolean;
  /** For agent events: the step it reported, rendered from our own translations. */
  step?: BuildStep;
  eventKind?: BuildEventKind;
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
    ...(progress?.revisions ?? []).map((revision) => ({
      kind: 'revision' as const,
      text: revision.text,
      at: Date.parse(revision.createdAt),
    })),
  ];

  // A revision the API has already echoed back must not appear twice.
  const known = new Set((progress?.revisions ?? []).map((revision) => revision.text));
  for (const pending of pendingRevisions) {
    if (!known.has(pending.text)) {
      entries.push({ kind: 'revision', text: pending.text, at: pending.at, pending: true });
    }
  }

  // Newest first — that's what makes the build feel live.
  return entries.filter((entry) => Number.isFinite(entry.at)).sort((a, b) => b.at - a.at);
}

/**
 * The game as it stands right now, playable, before anything has been committed.
 *
 * This is the earliest honest answer to the only question the creator can really
 * judge: is it any fun. `npm run create` leaves a playable starter on disk about a
 * minute into a build, and a watcher pushes whatever compiles from then on — so this
 * panel typically appears long before the first screenshot and many minutes before the
 * first commit. It is deliberately loaded by URL into a sandboxed frame rather than
 * fetched and inlined: the document is unreviewed agent output.
 */
function PlayableBuildPanel({ token, playable }: { token: string; playable: BuildPlayableItem[] }) {
  const { t, i18n } = useTranslation();
  const latest = playable[0];
  if (!latest) return null;

  return (
    <section className="status-playable" aria-live="polite">
      <h3>{t('statusView.playableTitle')}</h3>
      {/* The agent's own caption when it wrote one — untrusted text, rendered as text. */}
      <p className="status-playable-hint">{latest.label ?? t('statusView.playableHint')}</p>
      <div className="status-playable-frame">
        <GameFrame title={latest.slug ?? t('statusView.playableTitle')} src={buildPlayableUrl(token, latest)} />
      </div>
      {latest.createdAt ? (
        <p className="status-playable-time">
          {t('statusView.playableUpdated', { time: formatRelativeTime(latest.createdAt, i18n.language) })}
        </p>
      ) : null}
    </section>
  );
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
  const lastUpdate = activity[0];
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
                className={`build-activity-item build-activity-${entry.kind}${index === 0 ? ' build-progress-commit-latest' : ''}`}
              >
                <span className="build-activity-icon" aria-hidden="true">
                  <PixelIcon
                    name={
                      entry.kind === 'revision'
                        ? 'pencil'
                        : entry.kind === 'media'
                          ? 'eye'
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
                        : t('statusView.progress.yourRequest')}
                    </span>
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
