import { useCallback, useState } from 'react';
import './admin-small-panels.css';
import { fetchAccessTokens, mintAccessToken, revokeAccessToken, type AccessToken } from './adminApi.js';

/**
 * Personal access tokens (docs/agent-access-tokens.md), minted and revoked from a page.
 *
 * Until now this was the `token:mint` CLI or a curl command, which meant the practical
 * answer to "revoke that token" involved finding a laptop. Revocation is the half that
 * matters: a credential you cannot cancel quickly is one you have to be lucky with.
 *
 * Listing is per account rather than global, because the API has no "every token" read —
 * deliberately, since that response would be a map of every automation credential on the
 * site in one request.
 *
 * The secret is shown exactly once, on mint. It is stored only as a hash, so there is no
 * second chance and the panel says so rather than letting someone assume otherwise.
 */

const MINT_FAILURE_COPY: Record<string, string> = {
  unknown_uid: 'no such account — check the uid',
  blocked: 'that account is blocked',
  too_many_tokens: 'that account already holds the maximum number of tokens',
  invalid_expiry: 'expiry is outside the allowed range',
};

export function AccessTokensPanel() {
  const [uid, setUid] = useState('');
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [tokens, setTokens] = useState<AccessToken[] | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useCallback(async (forUid: string) => {
    if (!forUid.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await fetchAccessTokens(forUid.trim());
      if (result === null) {
        // Cleared, not left standing: a list from the previous uid sitting under the new
        // one reads as that account's tokens, and revoking off a mislabelled list is a
        // mistake this panel would have invited.
        setTokens(null);
        setMessage('not found');
        return;
      }
      setTokens(result);
    } catch {
      setTokens(null);
      setMessage('could not reach the API');
    } finally {
      setBusy(false);
    }
  }, []);

  const mint = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    setSecret(null);
    try {
      const days = Number(expiresInDays);
      const result = await mintAccessToken({
        uid: uid.trim(),
        name: name.trim(),
        ...(Number.isInteger(days) && days > 0 ? { expiresInDays: days } : {}),
      });
      if ('error' in result) {
        setMessage(MINT_FAILURE_COPY[result.error] ?? result.error);
        return;
      }
      setSecret(result.token);
      setName('');
      await list(uid);
    } catch {
      setMessage('could not reach the API');
    } finally {
      setBusy(false);
    }
  }, [expiresInDays, list, name, uid]);

  const revoke = useCallback(
    async (tokenId: string) => {
      setBusy(true);
      try {
        const { ok } = await revokeAccessToken(tokenId);
        setMessage(ok ? 'revoked' : 'could not revoke that token');
        await list(uid);
      } catch {
        // A revoke whose request never left is the one failure that must not look like
        // silence: the operator would walk away believing the credential is dead.
        setMessage('could not reach the API');
      } finally {
        setBusy(false);
      }
    },
    [list, uid],
  );

  return (
    <section className="admin-tokens">
      <h2 className="health-section-title">Access tokens</h2>

      <div className="admin-tokens-form">
        <label>
          Account uid
          <input value={uid} onChange={(event) => setUid(event.target.value)} placeholder="g:123…" />
        </label>
        <button type="button" disabled={busy || !uid.trim()} onClick={() => void list(uid)}>
          List
        </button>
        <label>
          Label
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="agent VM" />
        </label>
        <label>
          Days
          <input
            type="number"
            min={1}
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(event.target.value)}
            placeholder="default"
          />
        </label>
        <button type="button" disabled={busy || !uid.trim() || !name.trim()} onClick={() => void mint()}>
          Mint
        </button>
      </div>

      {message && <p className="admin-limits-message">{message}</p>}

      {secret && (
        <p className="admin-token-secret">
          <strong>Copy this now — it is not stored and cannot be shown again:</strong>
          <code>{secret}</code>
        </p>
      )}

      {tokens && tokens.length === 0 && <p className="health-empty">That account holds no tokens.</p>}

      {tokens && tokens.length > 0 && (
        <div className="health-table-scroll">
          <table className="health-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Id</th>
                <th>Expires</th>
                <th>Last used</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <tr key={token.tokenId} className={token.expired ? 'admin-token-row is-expired' : 'admin-token-row'}>
                  <td>{token.name}</td>
                  <td>
                    <code>{token.tokenId}</code>
                  </td>
                  <td>
                    {token.expiresAt}
                    {token.expired ? ' (expired)' : ''}
                  </td>
                  <td>{token.lastUsedAt ?? 'never'}</td>
                  <td>
                    <button type="button" disabled={busy} onClick={() => void revoke(token.tokenId)}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="health-note">
        Tokens act as their account and can never mint another — that is what keeps a leaked one inside a single
        account. Minting is session-only, so this page is the only place it can happen.
      </p>
    </section>
  );
}
