import { useCallback, useEffect, useState } from 'react';
import './admin-small-panels.css';
import { fetchFeaturedPool, setFeaturedPoolSlugs, type FeaturedPool } from './adminApi.js';

// Featured pool editor; the typed order is the rotation order.

export function FeaturedPoolPanel({ onChanged }: { onChanged?: () => void }) {
  const [pool, setPool] = useState<FeaturedPool | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchFeaturedPool();
      if (response === null) {
        setState('forbidden');
        return;
      }
      setPool(response);
      setDraft(response.slugs.join(', '));
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
    // Dedupe without sorting — typed order is the rotation order.
    const seen = new Set<string>();
    const slugs: string[] = [];
    for (const raw of draft.split(',')) {
      const slug = raw.trim().toLowerCase();
      if (slug && !seen.has(slug)) {
        seen.add(slug);
        slugs.push(slug);
      }
    }
    try {
      const result = await setFeaturedPoolSlugs(slugs);
      if ('error' in result) {
        setMessage(result.error);
        return;
      }
      setPool(result);
      setDraft(result.slugs.join(', '));
      setMessage('saved');
      onChanged?.();
    } catch {
      setMessage('could not reach the API');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'forbidden') return <p className="health-empty">Not found.</p>;
  if (state === 'loading') return <p className="health-empty">Reading the featured pool…</p>;
  if (state === 'error' || !pool) return <p className="health-empty">Could not read the featured pool.</p>;

  return (
    <section className="admin-limits">
      <h2 className="health-section-title">Home page featured pool</h2>
      <p className="health-summary">
        Rotates one game a day into the home page&apos;s featured slot; the rest back the &quot;Start here&quot; rail.
        Order is the rotation order, not just membership — list your best games first.
      </p>
      <div className="admin-limits-controls">
        <label className="admin-limits-cap">
          Game slugs, in order
          <input
            type="text"
            value={draft}
            disabled={busy}
            placeholder="apex-sprint, arena-tag, hearthvale"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button type="button" disabled={busy} onClick={() => void save()}>
          Save list
        </button>
      </div>
      {message && <p className="admin-limits-message">{message}</p>}
      <p className="health-note">
        {pool.stored
          ? `Stored by ${pool.stored.updatedBy ?? 'unknown'}${pool.stored.updatedAt ? ` at ${pool.stored.updatedAt}.` : '.'}`
          : 'Nothing stored — the featured slot falls back to the top of each visitor’s own recommended order.'}{' '}
        Clearing the field returns to that fallback.
      </p>
    </section>
  );
}
