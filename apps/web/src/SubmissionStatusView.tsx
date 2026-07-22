import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameFrame } from './GameFrame';
import { getSubmissionStatus, type SubmissionApiError, type SubmissionStatus } from './submissionApi';
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
                <button onClick={() => setShowGame(true)}>{t('statusView.play')}</button>
                {status.slug && <p className="status-slug">{t('statusView.slug', { slug: status.slug })}</p>}
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
    </>
  );
}
