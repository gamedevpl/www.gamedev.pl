import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getCreatorAgentKey,
  mintCreatorAgentKey,
  revokeCreatorAgentKey,
  rotateCreatorAgentKey,
  type CreatorAgentKeyPayload,
  type CreatorAgentKeyStatus,
} from './connectApi.js';
import { PixelIcon } from '../../PixelIcon.js';
import { formatRelativeTime } from '../../relativeTime.js';
import { recordStudioStep } from '../../visitTelemetry.js';
import './studio-connect.css';
import './studio-credentials.css';

/**
 * Creator-wide MCP opener controls (BY-27a). Sits with OAuth grants — both answer
 * "what can reach my account". The full key is held in memory for Copy and never
 * rendered into the DOM (BY-27b leak hygiene).
 */
export function StudioCreatorAgentKeyPanel() {
  const { t, i18n } = useTranslation();
  const baseId = useId();
  const keyRef = useRef<string | null>(null);
  const [maskedHeader, setMaskedHeader] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotateArmed, setRotateArmed] = useState(false);
  const [revokeArmed, setRevokeArmed] = useState(false);
  const [busy, setBusy] = useState<'mint' | 'rotate' | 'revoke' | null>(null);

  const applyPayload = useCallback((payload: CreatorAgentKeyPayload) => {
    keyRef.current = payload.key;
    setMaskedHeader(payload.authorizationHeaderMasked);
    setExpiresAt(payload.expiresAt);
    setRevoked(false);
  }, []);

  const applyStatus = useCallback(
    (status: CreatorAgentKeyStatus) => {
      if (status.revoked) {
        keyRef.current = null;
        setMaskedHeader(null);
        setExpiresAt(null);
        setRevoked(true);
        return;
      }
      applyPayload(status);
    },
    [applyPayload],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyStatus(await getCreatorAgentKey());
    } catch {
      setError(t('creatorKey.loadError'));
    } finally {
      setLoading(false);
    }
  }, [applyStatus, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const expiresExact =
    expiresAt != null
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(expiresAt * 1000),
        )
      : '';
  const expiresRelative = expiresAt != null ? formatRelativeTime(expiresAt * 1000, i18n.language) : '';

  const copyHeader = async () => {
    const key = keyRef.current;
    if (!key) return;
    try {
      await navigator.clipboard.writeText(`Authorization: Bearer ${key}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Masked line stays on screen; creator can mint again if copy fails.
    }
    recordStudioStep('connect_copied', 'self', 'header');
  };

  const handleMint = async () => {
    setBusy('mint');
    setError(null);
    try {
      applyPayload(await mintCreatorAgentKey());
    } catch {
      setError(t('creatorKey.mintError'));
    } finally {
      setBusy(null);
    }
  };

  const handleRotate = async () => {
    setBusy('rotate');
    setError(null);
    try {
      applyPayload(await rotateCreatorAgentKey());
      setRotateArmed(false);
    } catch {
      setError(t('creatorKey.rotateError'));
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = async () => {
    setBusy('revoke');
    setError(null);
    try {
      await revokeCreatorAgentKey();
      keyRef.current = null;
      setMaskedHeader(null);
      setExpiresAt(null);
      setRevoked(true);
      setRevokeArmed(false);
    } catch {
      setError(t('creatorKey.revokeError'));
    } finally {
      setBusy(null);
    }
  };

  const hasActiveKey = Boolean(maskedHeader) && !revoked;

  return (
    <section className="studio-credentials-section studio-creator-key" aria-labelledby={`${baseId}-title`}>
      <div className="studio-credential-heading">
        <h3 id={`${baseId}-title`} className="studio-agent-key-title">
          {t('creatorKey.title')}
        </h3>
        {!loading && hasActiveKey ? <span className="studio-credential-status">{t('creatorKey.active')}</span> : null}
      </div>
      <p className="studio-share-hint">{t('creatorKey.hint')}</p>

      {loading ? <p className="studio-connect-state">{t('creatorKey.loading')}</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && revoked ? (
        <div className="studio-credential-empty">
          <p className="studio-connect-state">{t('creatorKey.revoked')}</p>
          <button
            type="button"
            className="primary-btn studio-credential-action"
            disabled={busy === 'mint'}
            onClick={() => void handleMint()}
          >
            {busy === 'mint' ? t('creatorKey.minting') : t('creatorKey.mint')}
          </button>
        </div>
      ) : null}

      {!loading && hasActiveKey ? (
        <>
          <pre className="studio-connect-snippet" tabIndex={0} data-testid="creator-key-masked">
            {maskedHeader}
          </pre>
          {expiresAt != null ? (
            <p className="studio-connect-expiry">
              <time dateTime={new Date(expiresAt * 1000).toISOString()} title={expiresExact}>
                {t('creatorKey.expires', { when: expiresRelative })}
              </time>
            </p>
          ) : null}

          {!rotateArmed && !revokeArmed ? (
            <div className="studio-credential-actions" aria-live="polite">
              <button type="button" className="primary-btn studio-credential-action" onClick={() => void copyHeader()}>
                <PixelIcon name={copied ? 'check' : 'sparkle'} size={12} />{' '}
                {copied ? t('creatorKey.copied') : t('creatorKey.copyHeader')}
              </button>

              <button
                type="button"
                className="secondary-btn studio-credential-action"
                onClick={() => {
                  setRevokeArmed(false);
                  setRotateArmed(true);
                }}
              >
                {t('creatorKey.rotate.start')}
              </button>

              <button
                type="button"
                className="studio-credential-action is-danger"
                onClick={() => {
                  setRotateArmed(false);
                  setRevokeArmed(true);
                }}
              >
                {t('creatorKey.revoke.start')}
              </button>
            </div>
          ) : null}

          {rotateArmed ? (
            <div className="studio-credential-confirm" role="alert">
              <p>{t('creatorKey.rotate.confirm')}</p>
              <div className="studio-credential-actions">
                <button
                  autoFocus
                  type="button"
                  className="studio-credential-action is-danger"
                  disabled={busy !== null}
                  onClick={() => void handleRotate()}
                >
                  {busy === 'rotate' ? t('creatorKey.rotate.sending') : t('creatorKey.rotate.yes')}
                </button>
                <button
                  type="button"
                  className="secondary-btn studio-credential-action"
                  disabled={busy !== null}
                  onClick={() => setRotateArmed(false)}
                >
                  {t('creatorKey.rotate.no')}
                </button>
              </div>
            </div>
          ) : null}

          {revokeArmed ? (
            <div className="studio-credential-confirm is-danger" role="alert">
              <p>{t('creatorKey.revoke.confirm')}</p>
              <div className="studio-credential-actions">
                <button
                  autoFocus
                  type="button"
                  className="studio-credential-action is-danger"
                  disabled={busy !== null}
                  onClick={() => void handleRevoke()}
                >
                  {busy === 'revoke' ? t('creatorKey.revoke.sending') : t('creatorKey.revoke.yes')}
                </button>
                <button
                  type="button"
                  className="secondary-btn studio-credential-action"
                  disabled={busy !== null}
                  onClick={() => setRevokeArmed(false)}
                >
                  {t('creatorKey.revoke.no')}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
