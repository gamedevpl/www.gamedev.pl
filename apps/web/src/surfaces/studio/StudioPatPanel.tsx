import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

type PatRow = {
  tokenId: string;
  name: string;
  expiresAt: string;
  lastUsedAt?: string;
  expired: boolean;
};

async function patRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { credentials: 'include', ...init });
}

export function StudioPatPanel() {
  const { t } = useTranslation();
  const baseId = useId();
  const [tokens, setTokens] = useState<PatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('ci');
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await patRequest('/api/me/access-tokens');
      if (!res.ok) throw new Error('load');
      const body = (await res.json()) as { tokens: PatRow[] };
      setTokens(body.tokens);
    } catch {
      setError(t('patTokens.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mint() {
    setBusy(true);
    setError(null);
    setSecret(null);
    try {
      const res = await patRequest('/api/me/access-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, expiresInDays: days }),
      });
      if (!res.ok) throw new Error('mint');
      const body = (await res.json()) as PatRow & { token: string };
      setSecret(body.token);
      await load();
    } catch {
      setError(t('patTokens.mintError'));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(tokenId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await patRequest(`/api/me/access-tokens/${tokenId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('revoke');
      setSecret(null);
      await load();
    } catch {
      setError(t('patTokens.revokeError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="studio-agent-key" aria-labelledby={`${baseId}-title`} data-testid="pat-tokens">
      <h3 id={`${baseId}-title`} className="studio-agent-key-title">
        {t('patTokens.title')}
      </h3>
      <p className="studio-share-hint">{t('patTokens.hint')}</p>
      {loading ? <p className="studio-connect-state">{t('patTokens.loading')}</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {secret ? (
        <p className="studio-connect-state" data-testid="pat-secret">
          {t('patTokens.shownOnce')}: <code>{secret}</code>
        </p>
      ) : null}
      <div className="studio-connect-actions">
        <input
          aria-label={t('patTokens.name')}
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          aria-label={t('patTokens.days')}
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        />
        <button type="button" className="studio-connect-skip" disabled={busy} onClick={() => void mint()}>
          {busy ? t('patTokens.minting') : t('patTokens.mint')}
        </button>
      </div>
      <ul>
        {tokens.map((row) => (
          <li key={row.tokenId}>
            {row.name} · {row.expiresAt.slice(0, 10)}
            <button type="button" disabled={busy} onClick={() => void revoke(row.tokenId)}>
              {t('patTokens.revoke')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
