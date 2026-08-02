import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAgentKey, rotateAgentKey } from './connectApi.js';
import { PixelIcon } from './PixelIcon.js';
import { recordStudioStep } from './visitTelemetry.js';

type StudioAgentKeyPanelProps = {
  token: string;
};

/**
 * Legacy per-game key controls (BY-23). Rotate only — the BY-24 open-rounds opt-in
 * was withdrawn in BY-27b. Prefer the creator-wide key + keyless connect card.
 */
export function StudioAgentKeyPanel({ token }: StudioAgentKeyPanelProps) {
  const { t, i18n } = useTranslation();
  const baseId = useId();
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [kickoffPrompt, setKickoffPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotateArmed, setRotateArmed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [copiedKickoff, setCopiedKickoff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAgentKey(token)
      .then((payload) => {
        if (!cancelled) {
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

  const copyKickoff = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKickoff(true);
      window.setTimeout(() => setCopiedKickoff(false), 2000);
    } catch {
      // Snippet stays on screen to select by hand.
    }
    recordStudioStep('connect_copied', 'self', 'kickoff');
  };

  const handleRotate = async () => {
    setRotating(true);
    setRotateError(null);
    try {
      const next = await rotateAgentKey(token);
      setExpiresAt(next.expiresAt);
      setKickoffPrompt(next.kickoffPrompt);
      setRotateArmed(false);
    } catch {
      setRotateError(t('connect.rotate.error'));
    } finally {
      setRotating(false);
    }
  };

  return (
    <section className="studio-agent-key" aria-labelledby={`${baseId}-title`}>
      <h3 id={`${baseId}-title`} className="studio-agent-key-title">
        {t('agentKey.title')}
      </h3>

      {loading ? <p className="studio-connect-state">{t('agentKey.loading')}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading ? (
        <>
          <p className="studio-share-hint">{t('agentKey.legacyHint')}</p>
          {expiresLabel ? (
            <p className="studio-connect-expiry">{t('agentKey.expiry', { when: expiresLabel })}</p>
          ) : null}
          {kickoffPrompt ? (
            <div className="studio-connect-step">
              <p className="studio-connect-same">{t('agentKey.rotatedKickoff')}</p>
              <pre className="studio-connect-snippet studio-connect-kickoff" tabIndex={0}>
                {kickoffPrompt}
              </pre>
              <div className="studio-connect-actions">
                <button type="button" className="status-share-copy" onClick={() => void copyKickoff(kickoffPrompt)}>
                  <PixelIcon name={copiedKickoff ? 'check' : 'sparkle'} size={12} />{' '}
                  {copiedKickoff ? t('connect.copied') : t('connect.copyKickoff')}
                </button>
              </div>
            </div>
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
    </section>
  );
}
