import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GameTheater } from './GameTheater';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import {
  getBuildStats,
  getSubmissionPreview,
  getSubmissionStatus,
  submitFeedback,
  type BuildProgress,
  type SubmissionApiError,
  type SubmissionPreview,
  type SubmissionStatus,
} from './submissionApi';
import { draftHash, playHash, statusHash } from './router';
import { formatDuration, formatRelativeTime } from './relativeTime';

const TERMINAL_STATUSES = new Set<SubmissionStatus['status']>(['published', 'needs_changes']);
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

  if (current === 'needs_changes') {
    return (
      <div className="status-timeline-halted">
        <span className="status-timeline-halted-icon" aria-hidden="true">
          {STATUS_ICONS.needs_changes}
        </span>
        <span className="status-timeline-halted-label">{t('statusView.states.needs_changes.label')}</span>
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
};

export function SubmissionStatusView({
  token,
  submittedTitle,
  submittedConcept,
  submittedAt,
  trackingUrl,
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
    () => trackingUrl ?? new URL(statusHash(token), window.location.href).toString(),
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
    const hash = status?.status === 'published' ? playHash(slug) : draftHash(slug);
    return new URL(hash, window.location.href).toString();
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
            <a className="inline-link" href="#/">
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

            {status.status === 'needs_changes' ? (
              <a className="primary-btn status-retry" href="#/">
                <PixelIcon name="undo" size={13} /> {t('statusView.tryAgain')}
              </a>
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
                log is reference material and sits underneath. */}
            {(preview || status.status === 'needs_changes') && status.status !== 'published' ? (
              <FeedbackPanel
                token={token}
                onSent={(text) => setPendingRevisions((current) => [...current, { text, at: Date.now() }])}
              />
            ) : null}

            {status.progress ? (
              <BuildProgressPanel progress={status.progress} pendingRevisions={pendingRevisions} />
            ) : null}

            {previewError && !preview ? <p className="error">{previewError}</p> : null}

            <a className="inline-link" href="#/">
              {t('statusView.backHome')}
            </a>
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
 * Post-play revision loop: the creator played the draft and can describe what to
 * change. The feedback is relayed to the build agent (POST .../feedback), which
 * comments it onto the open PR so the agent iterates. Shown while the game is still
 * in progress (or needs changes) — a published game can't be revised here.
 */
function FeedbackPanel({ token, onSent }: { token: string; onSent: (text: string) => void }) {
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
      <h3 className="status-feedback-title">{t('statusView.feedback.title')}</h3>
      <p className="status-feedback-hint">{t('statusView.feedback.hint')}</p>
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
  kind: 'commit' | 'revision';
  text: string;
  at: number;
  /** Sent from this tab but not yet echoed back by the API. */
  pending?: boolean;
};

function buildActivityFeed(progress: BuildProgress, pendingRevisions: PendingRevision[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [
    ...progress.commits.map((commit) => ({
      kind: 'commit' as const,
      text: commit.message,
      at: Date.parse(commit.committedDate),
    })),
    ...(progress.revisions ?? []).map((revision) => ({
      kind: 'revision' as const,
      text: revision.text,
      at: Date.parse(revision.createdAt),
    })),
  ];

  // A revision the API has already echoed back must not appear twice.
  const known = new Set((progress.revisions ?? []).map((revision) => revision.text));
  for (const pending of pendingRevisions) {
    if (!known.has(pending.text)) {
      entries.push({ kind: 'revision', text: pending.text, at: pending.at, pending: true });
    }
  }

  // Newest first — that's what makes the build feel live.
  return entries.filter((entry) => Number.isFinite(entry.at)).sort((a, b) => b.at - a.at);
}

function BuildProgressPanel({
  progress,
  pendingRevisions,
}: {
  progress: BuildProgress;
  pendingRevisions: PendingRevision[];
}) {
  const { t, i18n } = useTranslation();
  const activity = buildActivityFeed(progress, pendingRevisions);

  if (progress.checklist.length === 0 && activity.length === 0 && !progress.note) {
    return null;
  }

  const doneCount = progress.checklist.filter((item) => item.checked).length;
  const donePercent = progress.checklist.length === 0 ? 0 : (doneCount / progress.checklist.length) * 100;
  // What the agent says it is doing beats what we infer from its checklist — fall
  // back to the first unfinished task only when it has written nothing.
  const currentStep = progress.note ? undefined : progress.checklist.find((item) => !item.checked);
  const lastUpdate = activity[0];
  // A long gap between pushes is normal, but silence with no explanation reads as
  // "it's broken" — say so plainly instead of letting the creator guess.
  const isQuiet = lastUpdate !== undefined && Date.now() - lastUpdate.at > QUIET_BUILD_MS;

  return (
    <div className="build-progress">
      {progress.note ? (
        <p className="build-progress-note" aria-live="polite">
          <span className="build-progress-note-label">{t('statusView.progress.agentSays')}</span>
          <span className="build-progress-note-text">{progress.note}</span>
        </p>
      ) : null}

      {progress.checklist.length > 0 ? (
        <div className="build-progress-checklist">
          <div className="build-progress-heading-row">
            <h3 className="build-progress-heading">{t('statusView.progress.checklistTitle')}</h3>
            <span className="build-progress-count">
              {t('statusView.progress.checklistCount', { done: doneCount, total: progress.checklist.length })}
            </span>
          </div>
          <div
            className="build-progress-bar"
            role="progressbar"
            aria-valuenow={doneCount}
            aria-valuemin={0}
            aria-valuemax={progress.checklist.length}
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
            {progress.checklist.map((item, index) => (
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
                  <PixelIcon name={entry.kind === 'revision' ? 'pencil' : 'wrench'} size={12} />
                </span>
                <span className="build-activity-body">
                  {entry.kind === 'revision' ? (
                    <span className="build-activity-label">
                      {entry.pending
                        ? t('statusView.progress.yourRequestSending')
                        : t('statusView.progress.yourRequest')}
                    </span>
                  ) : null}
                  <span className="build-activity-text">{entry.text}</span>
                </span>
                <time className="build-activity-time" dateTime={new Date(entry.at).toISOString()}>
                  {entry.pending ? '' : formatRelativeTime(entry.at, i18n.language)}
                </time>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
