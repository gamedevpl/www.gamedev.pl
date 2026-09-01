import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listOAuthGrants, revokeOAuthGrant, type OAuthGrantSummary } from './connectApi.js';
import { formatRelativeTime } from '../../relativeTime.js';
import './studio-connect.css';
import './studio-credentials.css';

/**
 * Connected coding-agent clients (BY-18b). Lists OAuth grants and lets the creator revoke.
 * UI copy never uses the word "token".
 */
export function StudioOAuthClientsPanel() {
  const { t, i18n } = useTranslation();
  const baseId = useId();
  const [grants, setGrants] = useState<OAuthGrantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listOAuthGrants();
      setGrants(rows);
    } catch {
      setError(t('oauthClients.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRevoke = async (grantId: string) => {
    setRevokingId(grantId);
    setError(null);
    try {
      await revokeOAuthGrant(grantId);
      setGrants((prev) => prev.filter((row) => row.grantId !== grantId));
      setConfirmingId((current) => (current === grantId ? null : current));
    } catch {
      setError(t('oauthClients.revokeError'));
    } finally {
      setRevokingId(null);
    }
  };

  const formatExact = (iso: string) => {
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  };

  return (
    <section className="studio-credentials-section studio-oauth-clients" aria-labelledby={`${baseId}-title`}>
      <h3 id={`${baseId}-title`} className="studio-agent-key-title">
        {t('oauthClients.title')}
      </h3>
      <p className="studio-share-hint">{t('oauthClients.hint')}</p>

      {loading ? <p className="studio-connect-state">{t('oauthClients.loading')}</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && grants.length === 0 ? <p className="studio-connect-state">{t('oauthClients.empty')}</p> : null}

      {!loading && grants.length > 0 ? (
        <ul className="studio-oauth-client-list">
          {grants.map((grant) => (
            <li key={grant.grantId} className="studio-oauth-client-row">
              <div className="studio-oauth-client-summary">
                <div className="studio-oauth-client-name">
                  <strong>{grant.clientLabel}</strong>
                </div>
                <p className="studio-oauth-client-meta">
                  {t('oauthClients.connectionId', { id: grant.grantId.slice(-6).toUpperCase() })}
                  {' · '}
                  {t('oauthClients.connectedLabel')}{' '}
                  <time dateTime={grant.createdAt} title={formatExact(grant.createdAt)}>
                    {formatRelativeTime(grant.createdAt, i18n.language)}
                  </time>
                  {' · '}
                  {t('oauthClients.lastUsedLabel')}{' '}
                  {grant.lastUsedAt ? (
                    <time dateTime={grant.lastUsedAt} title={formatExact(grant.lastUsedAt)}>
                      {formatRelativeTime(grant.lastUsedAt, i18n.language)}
                    </time>
                  ) : (
                    t('oauthClients.neverUsed')
                  )}
                </p>
              </div>

              {confirmingId === grant.grantId ? (
                <div className="studio-credential-confirm is-danger is-compact" role="alert">
                  <p>{t('oauthClients.confirm', { client: grant.clientLabel })}</p>
                  <div className="studio-credential-actions">
                    <button
                      autoFocus
                      type="button"
                      className="studio-credential-action is-danger"
                      disabled={revokingId !== null}
                      onClick={() => void handleRevoke(grant.grantId)}
                    >
                      {revokingId === grant.grantId ? t('oauthClients.revoking') : t('oauthClients.confirmYes')}
                    </button>
                    <button
                      type="button"
                      className="secondary-btn studio-credential-action"
                      disabled={revokingId !== null}
                      onClick={() => setConfirmingId(null)}
                    >
                      {t('oauthClients.confirmNo')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="studio-oauth-client-revoke"
                  disabled={revokingId !== null}
                  onClick={() => setConfirmingId(grant.grantId)}
                >
                  {t('oauthClients.revoke')}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
