import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getCreatorAgentKey,
  revokeCreatorAgentKey,
  rotateCreatorAgentKey,
  type CreatorAgentKeyPayload,
} from './connectApi.js';
import { PixelIcon } from './PixelIcon.js';

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
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [keyGeneration, setKeyGeneration] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotateArmed, setRotateArmed] = useState(false);
  const [revokeArmed, setRevokeArmed] = useState(false);
  const [busy, setBusy] = useState<'rotate' | 'revoke' | null>(null);

  const applyPayload = (payload: CreatorAgentKeyPayload) => {
    keyRef.current = payload.key;
    setMaskedHeader(payload.authorizationHeaderMasked);
    setFingerprint(payload.fingerprint);
    setExpiresAt(payload.expiresAt);
    setKeyGeneration(payload.keyGeneration);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyPayload(await getCreatorAgentKey());
    } catch {
      setError(t('creatorKey.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const expiresLabel =
    expiresAt != null
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(expiresAt * 1000),
        )
      : '';

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
      setFingerprint(null);
      setExpiresAt(null);
      setKeyGeneration(null);
      setRevokeArmed(false);
      applyPayload(await getCreatorAgentKey());
    } catch {
      setError(t('creatorKey.revokeError'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="studio-oauth-clients" aria-labelledby={`${baseId}-title`}>
      <h3 id={`${baseId}-title`} className="studio-agent-key-title">
        {t('creatorKey.title')}
      </h3>
      <p className="studio-share-hint">{t('creatorKey.hint')}</p>

      {loading ? <p className="studio-connect-state">{t('creatorKey.loading')}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && maskedHeader ? (
        <>
          <pre className="studio-connect-snippet" tabIndex={0} data-testid="creator-key-masked">
            {maskedHeader}
          </pre>
          <p className="studio-connect-expiry">
            {t('creatorKey.meta', {
              fingerprint: fingerprint ?? '',
              when: expiresLabel,
              generation: keyGeneration ?? 1,
            })}
          </p>
          <div className="studio-connect-actions">
            <button type="button" className="status-share-copy" onClick={() => void copyHeader()}>
              <PixelIcon name={copied ? 'check' : 'sparkle'} size={12} />{' '}
              {copied ? t('creatorKey.copied') : t('creatorKey.copyHeader')}
            </button>

            {!rotateArmed ? (
              <button type="button" className="studio-connect-skip" onClick={() => setRotateArmed(true)}>
                {t('creatorKey.rotate.start')}
              </button>
            ) : (
              <span className="studio-connect-rotate-confirm">
                <span>{t('creatorKey.rotate.confirm')}</span>
                <button
                  type="button"
                  className="studio-connect-skip is-danger"
                  disabled={busy !== null}
                  onClick={() => void handleRotate()}
                >
                  {busy === 'rotate' ? t('creatorKey.rotate.sending') : t('creatorKey.rotate.yes')}
                </button>
                <button
                  type="button"
                  className="studio-connect-skip"
                  disabled={busy !== null}
                  onClick={() => setRotateArmed(false)}
                >
                  {t('creatorKey.rotate.no')}
                </button>
              </span>
            )}

            {!revokeArmed ? (
              <button type="button" className="studio-connect-skip" onClick={() => setRevokeArmed(true)}>
                {t('creatorKey.revoke.start')}
              </button>
            ) : (
              <span className="studio-connect-rotate-confirm">
                <span>{t('creatorKey.revoke.confirm')}</span>
                <button
                  type="button"
                  className="studio-connect-skip is-danger"
                  disabled={busy !== null}
                  onClick={() => void handleRevoke()}
                >
                  {busy === 'revoke' ? t('creatorKey.revoke.sending') : t('creatorKey.revoke.yes')}
                </button>
                <button
                  type="button"
                  className="studio-connect-skip"
                  disabled={busy !== null}
                  onClick={() => setRevokeArmed(false)}
                >
                  {t('creatorKey.revoke.no')}
                </button>
              </span>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
