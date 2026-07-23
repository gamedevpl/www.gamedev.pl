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
const ACTIVE_POLL_MS = 6000;
const IDLE_POLL_MS = 20000;

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
  trackingUrl?: string;
};

export function SubmissionStatusView({
  token,
  submittedTitle,
  submittedConcept,
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
        <h2 className="section-title">{submittedTitle ?? t('statusView.title')}</h2>
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

  return (
    <div className="build-progress">
      {progress.checklist.length > 0 ? (
        <div className="build-progress-checklist">
          <h3 className="build-progress-heading">{t('statusView.progress.checklistTitle')}</h3>
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
