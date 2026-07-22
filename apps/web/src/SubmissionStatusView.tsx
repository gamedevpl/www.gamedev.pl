import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameFrame } from './GameFrame';
import {
  getSubmissionPreview,
  getSubmissionStatus,
  type SubmissionApiError,
  type SubmissionPreview,
  type SubmissionStatus,
} from './submissionApi';
import { statusHash } from './router';

const TERMINAL_STATUSES = new Set<SubmissionStatus['status']>(['published', 'needs_changes']);

type SubmissionStatusViewProps = {
  token: string;
  submittedTitle?: string;
  trackingUrl?: string;
};

export function SubmissionStatusView({ token, submittedTitle, trackingUrl }: SubmissionStatusViewProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInvalidToken, setIsInvalidToken] = useState(false);
  const [showGame, setShowGame] = useState(false);
  const [preview, setPreview] = useState<SubmissionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const currentTrackingUrl = useMemo(
    () => trackingUrl ?? new URL(statusHash(token), window.location.href).toString(),
    [token, trackingUrl],
  );

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;

    setStatus(null);
    setLoading(true);
    setErrorMessage(null);
    setIsInvalidToken(false);
    setShowGame(false);
    setPreview(null);
    setPreviewLoading(false);
    setPreviewError(null);

    const stopPolling = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const poll = async () => {
      try {
        const nextStatus = await getSubmissionStatus(token);
        if (cancelled) return;

        setStatus(nextStatus);
        setLoading(false);
        setErrorMessage(null);
        setIsInvalidToken(false);

        if (TERMINAL_STATUSES.has(nextStatus.status)) {
          stopPolling();
        }
      } catch (err) {
        if (cancelled) return;

        const apiError = err as SubmissionApiError;
        setStatus(null);
        setLoading(false);
        setIsInvalidToken(apiError.status === 400);
        setErrorMessage(
          apiError.status === 400 ? t('statusView.invalidToken') : apiError.message || t('errors.generic'),
        );

        if (apiError.status === 400) {
          stopPolling();
        }
      }
    };

    void poll();
    intervalId = window.setInterval(() => {
      void poll();
    }, 30000);

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [t, token]);

  const publishedGameTitle = submittedTitle ?? status?.slug ?? t('statusView.publishedGameTitle');

  const loadPreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await getSubmissionPreview(token);
      setPreview(result);
    } catch (err) {
      const apiError = err as SubmissionApiError;
      setPreview(null);
      setPreviewError(apiError.status === 409 ? t('statusView.previewNotReady') : t('statusView.previewError'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const previewTitle = preview?.title ?? submittedTitle ?? status?.preview?.slug ?? t('statusView.previewGameTitle');

  return (
    <>
      <section className="panel status-panel">
        <h2 className="section-title">{t('statusView.title')}</h2>
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
            <p className={`status-badge status-${status.status}`}>{t(`statusView.states.${status.status}.label`)}</p>
            <p className="status-description">{t(`statusView.states.${status.status}.description`)}</p>

            {status.status === 'published' && status.playUrl ? (
              <div className="status-actions">
                <button className="primary-btn" onClick={() => setShowGame(true)}>
                  {t('statusView.play')}
                </button>
                {status.slug && <p className="status-slug">{t('statusView.slug', { slug: status.slug })}</p>}
              </div>
            ) : null}

            {status.preview && !preview ? (
              <div className="status-actions">
                <button className="secondary-btn" onClick={() => void loadPreview()} disabled={previewLoading}>
                  {previewLoading ? t('statusView.previewLoading') : t('statusView.previewPlay')}
                </button>
                <p className="status-preview-note">{t('statusView.previewNote')}</p>
                {previewError && <p className="error">{previewError}</p>}
              </div>
            ) : null}

            <a className="inline-link" href="#/">
              {t('statusView.backHome')}
            </a>
          </>
        ) : null}
      </section>

      {showGame && status?.status === 'published' && status.playUrl ? (
        <section className="panel stage">
          <div className="game-meta">
            <h2>{publishedGameTitle}</h2>
            {status.slug && <p>{t('statusView.slug', { slug: status.slug })}</p>}
          </div>
          <GameFrame title={publishedGameTitle} src={status.playUrl} />
        </section>
      ) : null}

      {preview ? (
        <section className="panel stage">
          <div className="game-meta">
            <h2>{previewTitle}</h2>
            <p className="status-preview-badge">{t('statusView.previewBadge')}</p>
          </div>
          <GameFrame title={previewTitle} html={preview.html} />
        </section>
      ) : null}
    </>
  );
}
