import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAgentKey, rotateAgentKey, setAgentOpenRounds } from './connectApi.js';
import { recordStudioStep } from './visitTelemetry.js';

type StudioAgentKeyPanelProps = {
  token: string;
  /** Compact mode hides rotate and extra copy — for the connect card. */
  compact?: boolean;
};

/**
 * Durable per-game key controls (BY-23 / BY-24): opt-in for agent-opened rounds and
 * rotate. Never uses the word "token" in UI copy.
 */
export function StudioAgentKeyPanel({ token, compact = false }: StudioAgentKeyPanelProps) {
  const { t, i18n } = useTranslation();
  const baseId = useId();
  const [allowAgentOpenRounds, setAllowAgentOpenRounds] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [rotateArmed, setRotateArmed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAgentKey(token)
      .then((payload) => {
        if (!cancelled) {
          setAllowAgentOpenRounds(payload.allowAgentOpenRounds);
          setExpiresAt(payload.expiresAt);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('agentKey.loadError'));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const expiresLabel =
    expiresAt != null
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(expiresAt * 1000),
        )
      : '';

  const handleToggle = async () => {
    const next = !allowAgentOpenRounds;
    setToggleBusy(true);
    setError(null);
    setAllowAgentOpenRounds(next);
    try {
      const result = await setAgentOpenRounds(token, next);
      setAllowAgentOpenRounds(result.allowAgentOpenRounds);
    } catch {
      setAllowAgentOpenRounds(!next);
      setError(t('agentKey.toggleError'));
    } finally {
      setToggleBusy(false);
    }
  };

  const handleRotate = async () => {
    setRotating(true);
    setRotateError(null);
    try {
      const next = await rotateAgentKey(token);
      setExpiresAt(next.expiresAt);
      setAllowAgentOpenRounds(next.allowAgentOpenRounds);
      setRotateArmed(false);
      recordStudioStep('connect_copied', 'self', 'kickoff');
    } catch {
      setRotateError(t('connect.rotate.error'));
    } finally {
      setRotating(false);
    }
  };

  return (
    <section className="studio-agent-key" aria-labelledby={`${baseId}-title`}>
      {!compact ? (
        <h3 id={`${baseId}-title`} className="studio-agent-key-title">
          {t('agentKey.title')}
        </h3>
      ) : null}

      {loading ? <p className="studio-connect-state">{t('agentKey.loading')}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading ? (
        <>
          <div className="studio-share-head">
            <h4 className="studio-share-title">{t('agentKey.openRounds.title')}</h4>
            <button
              type="button"
              role="switch"
              aria-checked={allowAgentOpenRounds}
              className={`studio-share-toggle${allowAgentOpenRounds ? ' is-on' : ''}`}
              onClick={() => void handleToggle()}
              disabled={toggleBusy}
            >
              <span className="studio-share-toggle-track" aria-hidden="true" />
              {allowAgentOpenRounds ? t('agentKey.openRounds.on') : t('agentKey.openRounds.off')}
            </button>
          </div>
          <p className="studio-share-hint">{t('agentKey.openRounds.hint')}</p>

          {!compact ? (
            <>
              {expiresLabel ? (
                <p className="studio-connect-expiry">{t('agentKey.expiry', { when: expiresLabel })}</p>
              ) : null}
              <div className="studio-connect-actions">
                {!rotateArmed ? (
                  <button type="button" className="studio-connect-skip" onClick={() => setRotateArmed(true)}>
                    {t('connect.rotate.start')}
                  </button>
                ) : (
                  <span className="studio-connect-rotate-confirm">
                    <span>{t('connect.rotate.confirm')}</span>
                    <button
                      type="button"
                      className="studio-connect-skip is-danger"
                      disabled={rotating}
                      onClick={() => void handleRotate()}
                    >
                      {rotating ? t('connect.rotate.sending') : t('connect.rotate.yes')}
                    </button>
                    <button
                      type="button"
                      className="studio-connect-skip"
                      disabled={rotating}
                      onClick={() => setRotateArmed(false)}
                    >
                      {t('connect.rotate.no')}
                    </button>
                  </span>
                )}
              </div>
              {rotateError ? <p className="error">{rotateError}</p> : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** Agent-open-rounds toggle only — shared by the connect card. */
export function AgentOpenRoundsToggle({ token }: { token: string }) {
  return <StudioAgentKeyPanel token={token} compact />;
}
