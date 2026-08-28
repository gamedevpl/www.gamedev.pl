import { useCallback, useEffect, useState } from 'react';
import { fetchPublicPlay, setPublicPlaySlugs, type PublicPlay } from './adminApi.js';

function relative(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

export function PublicPlayPanel({ onChanged }: { onChanged?: () => void }) {
  const [config, setConfig] = useState<PublicPlay | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchPublicPlay();
      if (response === null) {
        setState('forbidden');
        return;
      }
      setConfig(response);
      setDraft(response.effective.slugs.join(', '));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const slugs = [
      ...new Set(
        draft
          .split(',')
          .map((slug) => slug.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    try {
      const result = await setPublicPlaySlugs(slugs);
      if ('error' in result) {
        setMessage(result.error);
        return;
      }
      setConfig(result);
      setDraft(result.effective.slugs.join(', '));
      setMessage(`in force everywhere within ${relative(result.propagationMs)}`);
      onChanged?.();
    } catch {
      setMessage('could not reach the API');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'forbidden') return <p className="health-empty">Not found.</p>;
  if (state === 'loading') return <p className="health-empty">Reading promotional access…</p>;
  if (state === 'error' || !config) return <p className="health-empty">Could not read promotional access.</p>;

  return (
    <section className="admin-limits">
      <h2 className="health-section-title">Promotional game links</h2>
      <p className="health-summary">
        Published games in this list can be played anonymously from <code>/play/&lt;slug&gt;</code> during closed beta.
      </p>
      <div className="admin-limits-controls">
        <label className="admin-limits-cap">
          Game slugs
          <input
            type="text"
            value={draft}
            disabled={busy}
            placeholder="airtime, another-game"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button type="button" disabled={busy} onClick={() => void save()}>
          Save list
        </button>
      </div>
      {message && <p className="admin-limits-message">{message}</p>}
      <p className="health-note">
        {config.stored
          ? `Stored by ${config.stored.updatedBy ?? 'unknown'}${config.stored.updatedAt ? ` at ${config.stored.updatedAt}.` : '.'}`
          : 'Nothing stored — the deployed fallback is in force.'}{' '}
        Clearing the field removes every promotional exception.
      </p>
    </section>
  );
}
