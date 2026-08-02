import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getCreatorAgentKey,
  mintCreatorAgentKey,
  revokeCreatorAgentKey,
  rotateCreatorAgentKey,
  type CreatorAgentKeyStatus,
} from './connectApi.js';

/**
 * Creator-wide MCP opener key (BY-27a). Sits with the OAuth grants panel — both answer
 * "what can reach my account". UI copy never uses the word "token".
 */
export function StudioCreatorAgentKeyPanel() {
  const { t, i18n } = useTranslation();
  const baseId = useId();
  const [status, setStatus] = useState<CreatorAgentKeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'mint' | 'rotate' | 'revoke' | null>(null);
  const [rotateArmed, setRotateArmed] = useState(false);
  const [revokeArmed, setRevokeArmed] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getCreatorAgentKey();
      setStatus(next);
      if (next.key) setRevealedKey(next.key);
    } catch {
      setError(t('creatorAgentKey.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const expiresLabel =
    status?.expiresAt != null
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(status.expiresAt * 1000),
        )
      : '';

  const hasActiveKey = Boolean(status && !status.revoked && status.keyGeneration > 0);

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Key stays on screen to select by hand.
    }
  };

  const handleMint = async () => {
    setBusy('mint');
    setError(null);
    try {
      const minted = await mintCreatorAgentKey();
      setStatus({
        keyGeneration: minted.keyGeneration,
        revoked: false,
        key: minted.key,
        expiresAt: minted.expiresAt,
      });
      setRevealedKey(minted.key);
    } catch {
      setError(t('creatorAgentKey.mintError'));
    } finally {
      setBusy(null);
    }
  };

  const handleRotate = async () => {
    setBusy('rotate');
    setError(null);
    try {
      const rotated = await rotateCreatorAgentKey();
      setStatus({
        keyGeneration: rotated.keyGeneration,
        revoked: false,
        key: rotated.key,
        expiresAt: rotated.expiresAt,
      });
      setRevealedKey(rotated.key);
      setRotateArmed(false);
    } catch {
      setError(t('creatorAgentKey.rotateError'));
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = async () => {
    setBusy('revoke');
    setError(null);
    try {
      await revokeCreatorAgentKey();
      setStatus((prev) =>
        prev ? { keyGeneration: prev.keyGeneration + 1, revoked: true } : { keyGeneration: 1, revoked: true },
      );
      setRevealedKey(null);
      setRevokeArmed(false);
    } catch {
      setError(t('creatorAgentKey.revokeError'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="studio-creator-agent-key" aria-labelledby={`${baseId}-title`}>
      <h3 id={`${baseId}-title`} className="studio-agent-key-title">
        {t('creatorAgentKey.title')}
      </h3>
      <p className="studio-share-hint">{t('creatorAgentKey.hint')}</p>

      {loading ? <p className="studio-connect-state">{t('creatorAgentKey.loading')}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && !hasActiveKey ? (
        <div className="studio-creator-agent-key-actions">
          <p className="studio-connect-state">
            {status?.revoked ? t('creatorAgentKey.revoked') : t('creatorAgentKey.empty')}
          </p>
          <button type="button" className="button" disabled={busy === 'mint'} onClick={() => void handleMint()}>
            {busy === 'mint' ? t('creatorAgentKey.minting') : t('creatorAgentKey.mint')}
          </button>
        </div>
      ) : null}

      {!loading && hasActiveKey ? (
        <>
          {expiresLabel ? (
            <p className="studio-connect-expiry">{t('creatorAgentKey.expiry', { when: expiresLabel })}</p>
          ) : null}

          {revealedKey ? (
            <div className="studio-creator-agent-key-reveal">
              <p className="studio-share-hint">{t('creatorAgentKey.headerHint')}</p>
              <pre className="studio-creator-agent-key-value" tabIndex={0}>
                {revealedKey}
              </pre>
              <button type="button" className="button" onClick={() => void copyKey(revealedKey)}>
                {copied ? t('creatorAgentKey.copied') : t('creatorAgentKey.copy')}
              </button>
            </div>
          ) : null}

          <div className="studio-creator-agent-key-actions">
            {rotateArmed ? (
              <>
                <p className="studio-share-hint">{t('creatorAgentKey.rotate.confirm')}</p>
                <button
                  type="button"
                  className="studio-connect-skip is-danger"
                  disabled={busy === 'rotate'}
                  onClick={() => void handleRotate()}
                >
                  {busy === 'rotate' ? t('creatorAgentKey.rotate.sending') : t('creatorAgentKey.rotate.yes')}
                </button>
                <button
                  type="button"
                  className="studio-connect-skip"
                  disabled={busy === 'rotate'}
                  onClick={() => setRotateArmed(false)}
                >
                  {t('creatorAgentKey.rotate.no')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="studio-connect-skip is-danger"
                disabled={busy !== null}
                onClick={() => {
                  setRotateArmed(true);
                  setRevokeArmed(false);
                }}
              >
                {t('creatorAgentKey.rotate.start')}
              </button>
            )}

            {revokeArmed ? (
              <>
                <p className="studio-share-hint">{t('creatorAgentKey.revoke.confirm')}</p>
                <button
                  type="button"
                  className="studio-connect-skip is-danger"
                  disabled={busy === 'revoke'}
                  onClick={() => void handleRevoke()}
                >
                  {busy === 'revoke' ? t('creatorAgentKey.revoke.sending') : t('creatorAgentKey.revoke.yes')}
                </button>
                <button
                  type="button"
                  className="studio-connect-skip"
                  disabled={busy === 'revoke'}
                  onClick={() => setRevokeArmed(false)}
                >
                  {t('creatorAgentKey.revoke.no')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="studio-connect-skip is-danger"
                disabled={busy !== null}
                onClick={() => {
                  setRevokeArmed(true);
                  setRotateArmed(false);
                }}
              >
                {t('creatorAgentKey.revoke.start')}
              </button>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
