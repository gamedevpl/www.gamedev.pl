import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameFrame } from './GameFrame';
import { PublishedGameFrame } from './PublishedGameFrame';
import {
  getSubmissionPreview,
  getSubmissionStatus,
  type BuildProgress,
  type SubmissionApiError,
  type SubmissionPreview,
  type SubmissionStatus,
} from './submissionApi';
import { statusHash } from './router';

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

const STATUS_ICONS: Record<SubmissionStatus['status'], string> = {
  queued: '🕓',
  building: '🛠️',
  in_review: '👀',
  publishing: '🚀',
  published: '🎉',
  needs_changes: '✏️',
};

// The linear happy path the timeline visualizes. needs_changes branches off it,
// so it's handled as a separate "halted" state rather than a timeline position.
const TIMELINE_STEPS: SubmissionStatus['status'][] = ['queued', 'building', 'in_review', 'publishing', 'published'];

/** "4s" / "2m 14s" / "1h 03m" — compact, and it keeps ticking so the page feels alive. */
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

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
          <li key={step} className={`status-timeline-step status-timeline-${stepState}`}>
            <span className="status-timeline-dot" aria-hidden="true">
              {stepState === 'done' ? '✓' : STATUS_ICONS[step]}
            </span>
            <span className="status-timeline-label">{t(`statusView.states.${step}.label`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

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
  const { t } = useTranslation();
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInvalidToken, setIsInvalidToken] = useState(false);
  const [showGame, setShowGame] = useState(false);
  const [preview, setPreview] = useState<SubmissionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRefreshing, setPreviewRefreshing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

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
    setLoading(true);
    setErrorMessage(null);
    setIsInvalidToken(false);
    setShowGame(false);
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
        const nextStatus = await getSubmissionStatus(token);
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
  }, [t, token]);

  const publishedGameTitle = submittedTitle ?? status?.slug ?? t('statusView.publishedGameTitle');

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
            <p className="status-description">{t(`statusView.states.${status.status}.description`)}</p>

            {status.status === 'published' && status.slug ? (
              <div className="status-actions">
                <button className="primary-btn" onClick={() => setShowGame(true)}>
                  {t('statusView.play')}
                </button>
                {status.slug && <p className="status-slug">{t('statusView.slug', { slug: status.slug })}</p>}
              </div>
            ) : null}

            {status.progress ? <BuildProgressPanel progress={status.progress} /> : null}

            {previewError && !preview ? <p className="error">{previewError}</p> : null}

            <a className="inline-link" href="#/">
              {t('statusView.backHome')}
            </a>
          </>
        ) : null}
      </section>

      {showGame && status?.status === 'published' && status.slug ? (
        <section className="panel stage">
          <div className="game-meta">
            <h2>{publishedGameTitle}</h2>
            <p>{t('statusView.slug', { slug: status.slug })}</p>
          </div>
          <PublishedGameFrame slug={status.slug} title={publishedGameTitle} />
        </section>
      ) : null}

      {previewLoading && !preview ? (
        <section className="panel stage">
          <p className="catalog-state">{t('statusView.previewLoading')}</p>
        </section>
      ) : null}

      {preview ? (
        <section className="panel stage">
          <div className="game-meta">
            <h2>{previewTitle}</h2>
            <p className="status-preview-badge">
              <span className="live-dot" aria-hidden="true" />
              {previewRefreshing ? t('statusView.previewUpdating') : t('statusView.previewBadge')}
            </p>
          </div>
          <GameFrame title={previewTitle} html={preview.html} />
        </section>
      ) : null}
    </>
  );
}

function BuildProgressPanel({ progress }: { progress: BuildProgress }) {
  const { t } = useTranslation();
  if (progress.checklist.length === 0 && progress.commits.length === 0) {
    return null;
  }

  // Newest activity first — that's what makes the build feel "live".
  const recentCommits = [...progress.commits].reverse();
  const doneCount = progress.checklist.filter((item) => item.checked).length;
  const donePercent = progress.checklist.length === 0 ? 0 : (doneCount / progress.checklist.length) * 100;

  return (
    <div className="build-progress">
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
          <ul>
            {progress.checklist.map((item, index) => (
              <li key={index} className={item.checked ? 'checklist-done' : 'checklist-pending'}>
                <span aria-hidden="true">{item.checked ? '✅' : '⬜'}</span> {item.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recentCommits.length > 0 ? (
        <div className="build-progress-commits">
          <h3 className="build-progress-heading">{t('statusView.progress.commitsTitle')}</h3>
          <ul>
            {recentCommits.map((commit, index) => (
              <li key={index} className={index === 0 ? 'build-progress-commit-latest' : undefined}>
                {commit.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
