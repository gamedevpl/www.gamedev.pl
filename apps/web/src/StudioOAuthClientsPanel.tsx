import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listOAuthGrants, revokeOAuthGrant, type OAuthGrantSummary } from './connectApi.js';

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
    } catch {
      setError(t('oauthClients.revokeError'));
    } finally {
      setRevokingId(null);
    }
  };

  const formatWhen = (iso: string | null) => {
    if (!iso) return t('oauthClients.neverUsed');
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  };

  return (
    <section className="studio-oauth-clients" aria-labelledby={`${baseId}-title`}>
      <h3 id={`${baseId}-title`} className="studio-agent-key-title">
        {t('oauthClients.title')}
      </h3>
      <p className="studio-share-hint">{t('oauthClients.hint')}</p>

      {loading ? <p className="studio-connect-state">{t('oauthClients.loading')}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && grants.length === 0 ? <p className="studio-connect-state">{t('oauthClients.empty')}</p> : null}

      {!loading && grants.length > 0 ? (
        <ul className="studio-oauth-client-list">
          {grants.map((grant) => (
            <li key={grant.grantId} className="studio-oauth-client-row">
              <div className="studio-oauth-client-meta">
                <strong>{grant.clientLabel}</strong>
                <span className="studio-oauth-client-dates">
                  {t('oauthClients.connected', { when: formatWhen(grant.createdAt) })}
                  {' · '}
                  {t('oauthClients.lastUsed', { when: formatWhen(grant.lastUsedAt) })}
                </span>
              </div>
              <button
                type="button"
                className="studio-connect-skip is-danger"
                disabled={revokingId === grant.grantId}
                onClick={() => void handleRevoke(grant.grantId)}
              >
                {revokingId === grant.grantId ? t('oauthClients.revoking') : t('oauthClients.revoke')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
