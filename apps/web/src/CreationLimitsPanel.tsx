import { useCallback, useEffect, useState } from 'react';
import { fetchCreationLimits, setCreationLimits, type CreationLimits } from './adminApi.js';
import { PublicPlayPanel } from './PublicPlayPanel.js';

/**
 * The creation circuit-breaker, as something an operator can actually pull.
 *
 * The endpoint has existed since the breaker did; pulling it meant a curl command or an
 * edit in the Firestore console. Both work, and neither is reachable from a phone at the
 * moment somebody notices the site is minting builds it should not be — which is the only
 * moment this feature is for.
 *
 * The panel reports **effective** state rather than what is stored: an unset ceiling is
 * still a ceiling, and an operator deciding whether to pause needs the number actually in
 * force, not the absence of a document.
 */

function relative(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

export function CreationLimitsPanel({ onChanged }: { onChanged?: () => void }) {
  const [limits, setLimits] = useState<CreationLimits | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [capDraft, setCapDraft] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetchCreationLimits();
      if (response === null) {
        setState('forbidden');
        return;
      }
      setLimits(response);
      setCapDraft(String(response.effective.globalDailySubmissionCap));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = useCallback(
    async (patch: { paused?: boolean; globalDailySubmissionCap?: number | null }) => {
      setBusy(true);
      setMessage(null);
      try {
        const result = await setCreationLimits(patch);
        if ('error' in result) {
          setMessage(result.error);
          return;
        }
        setLimits(result);
        setCapDraft(String(result.effective.globalDailySubmissionCap));
        // The change lands in Firestore, and instances read it through a cache — so say
        // when it will be everywhere rather than implying it already is.
        setMessage(`in force everywhere within ${relative(result.propagationMs)}`);
        onChanged?.();
      } catch {
        setMessage('could not reach the API');
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  if (state === 'forbidden') return <p className="health-empty">Not found.</p>;
  if (state === 'loading') return <p className="health-empty">Reading the breaker…</p>;
  if (state === 'error' || !limits) return <p className="health-empty">Could not read the breaker.</p>;

  const { effective, stored, today } = limits;
  const parsedCap = Number(capDraft);
  const capValid = Number.isInteger(parsedCap) && parsedCap >= 0;

  return (
    <>
      <section className="admin-limits">
        <h2 className="health-section-title">Creation limits</h2>
        <p className="health-summary">
          {effective.paused ? 'Creation is paused.' : 'Creation is open.'} {today.submissions} of{' '}
          {effective.globalDailySubmissionCap} used today ({today.dateStr}).
        </p>

        <div className="admin-limits-controls">
          <button
            type="button"
            className={effective.paused ? 'admin-limits-resume' : 'admin-limits-pause'}
            disabled={busy}
            onClick={() => void apply({ paused: !effective.paused })}
          >
            {effective.paused ? 'Resume creation' : 'Pause creation'}
          </button>

          <label className="admin-limits-cap">
            Daily cap
            <input
              type="number"
              min={0}
              value={capDraft}
              disabled={busy}
              onChange={(event) => setCapDraft(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !capValid || parsedCap === effective.globalDailySubmissionCap}
            onClick={() => void apply({ globalDailySubmissionCap: parsedCap })}
          >
            Set cap
          </button>
          {/* Clearing is a different intent from setting a number: it hands the decision
            back to whatever the deployment's default is, rather than freezing today's
            number into the config document forever. */}
          <button
            type="button"
            disabled={
              busy || stored?.globalDailySubmissionCap === undefined || stored?.globalDailySubmissionCap === null
            }
            onClick={() => void apply({ globalDailySubmissionCap: null })}
          >
            Use the deployed default
          </button>
        </div>

        {message && <p className="admin-limits-message">{message}</p>}

        <p className="health-note">
          {stored
            ? `Stored by ${stored.updatedBy ?? 'unknown'}${stored.updatedAt ? ` at ${stored.updatedAt}` : ''}.`
            : 'Nothing stored — the deployed defaults are what is in force.'}{' '}
          A change needs no redeploy and reaches every instance within {relative(limits.propagationMs)}.
        </p>
      </section>
      <PublicPlayPanel onChanged={onChanged} />
    </>
  );
}
