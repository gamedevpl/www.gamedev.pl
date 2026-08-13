import { useCallback, useEffect, useState } from 'react';
import {
  fetchCreationLimits,
  setCreationLimits,
  type CreationLimits,
  type ManagedAgentVendor,
  type ManagedBuilderMode,
} from './adminApi.js';
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
  const [managedCapDraft, setManagedCapDraft] = useState('');
  const [managedUserCapDraft, setManagedUserCapDraft] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetchCreationLimits();
      if (response === null) {
        setState('forbidden');
        return;
      }
      setLimits(response);
      setCapDraft(String(response.effective.globalDailySubmissionCap));
      setManagedCapDraft(response.effective.managedDailyCap === null ? '' : String(response.effective.managedDailyCap));
      setManagedUserCapDraft(
        response.effective.managedDailyUserCap === null ? '' : String(response.effective.managedDailyUserCap),
      );
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = useCallback(
    async (patch: {
      paused?: boolean;
      globalDailySubmissionCap?: number | null;
      managedBuilderMode?: ManagedBuilderMode;
      managedAgentVendorOverride?: ManagedAgentVendor | null;
      managedDailyCap?: number | null;
      managedDailyUserCap?: number | null;
    }) => {
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
        setManagedCapDraft(result.effective.managedDailyCap === null ? '' : String(result.effective.managedDailyCap));
        setManagedUserCapDraft(
          result.effective.managedDailyUserCap === null ? '' : String(result.effective.managedDailyUserCap),
        );
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

  const parsedManagedCap = managedCapDraft.trim() === '' ? null : Number(managedCapDraft);
  const managedCapValid = parsedManagedCap === null || (Number.isInteger(parsedManagedCap) && parsedManagedCap >= 0);
  const parsedManagedUserCap = managedUserCapDraft.trim() === '' ? null : Number(managedUserCapDraft);
  const managedUserCapValid =
    parsedManagedUserCap === null || (Number.isInteger(parsedManagedUserCap) && parsedManagedUserCap >= 0);

  const managedStatusLine = !effective.hasPlatformBackend
    ? 'Not configured in this environment (reads as "coming soon" regardless of the switch below).'
    : effective.managedBuilderMode === 'off'
      ? 'Off — the platform option shows as temporarily unavailable.'
      : effective.managedBuilderMode === 'coming_soon'
        ? 'Marked coming soon — the platform option shows as not yet launched.'
        : 'Auto — offered normally.';

  const { stored: storedVendor, effective: effectiveVendor, defaultVendor } = effective.managedAgentVendor;
  const vendorStatusLine =
    storedVendor === null
      ? `Using the deployed default (${defaultVendor ?? 'none configured'}).`
      : storedVendor === effectiveVendor
        ? `Overridden to ${effectiveVendor} (no redeploy needed).`
        : `Overridden to ${storedVendor}, but that vendor has no credentials in this environment — falling back to ${effectiveVendor ?? 'none'}.`;

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

      <section className="admin-limits">
        <h2 className="health-section-title">Managed (Gamedev.pl) builder</h2>
        <p className="health-summary">
          {managedStatusLine} {today.managedBuilds} platform round{today.managedBuilds === 1 ? '' : 's'} started today (
          {today.dateStr}).
        </p>
        <p className="health-summary">{vendorStatusLine}</p>

        <div className="admin-limits-controls">
          <label className="admin-limits-cap">
            Mode
            <select
              value={effective.managedBuilderMode}
              disabled={busy}
              onChange={(event) => void apply({ managedBuilderMode: event.target.value as ManagedBuilderMode })}
            >
              <option value="auto">Auto (offer when configured)</option>
              <option value="coming_soon">Coming soon</option>
              <option value="off">Off (incident)</option>
            </select>
          </label>

          <label className="admin-limits-cap">
            Vendor
            <select
              value={effective.managedAgentVendor.stored ?? ''}
              disabled={busy}
              onChange={(event) =>
                void apply({
                  managedAgentVendorOverride:
                    event.target.value === '' ? null : (event.target.value as ManagedAgentVendor),
                })
              }
            >
              <option value="">Default ({effective.managedAgentVendor.defaultVendor ?? 'none configured'})</option>
              {effective.managedAgentVendor.configuredVendors.map((vendor) => (
                <option key={vendor} value={vendor}>
                  {vendor}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-limits-cap">
            Daily cap (shared)
            <input
              type="number"
              min={0}
              placeholder="no cap"
              value={managedCapDraft}
              disabled={busy}
              onChange={(event) => setManagedCapDraft(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!managedCapValid || busy || parsedManagedCap === effective.managedDailyCap}
            onClick={() => void apply({ managedDailyCap: parsedManagedCap })}
          >
            Set shared cap
          </button>

          <label className="admin-limits-cap">
            Daily cap (per creator)
            <input
              type="number"
              min={0}
              placeholder="no cap"
              value={managedUserCapDraft}
              disabled={busy}
              onChange={(event) => setManagedUserCapDraft(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!managedUserCapValid || busy || parsedManagedUserCap === effective.managedDailyUserCap}
            onClick={() => void apply({ managedDailyUserCap: parsedManagedUserCap })}
          >
            Set per-creator cap
          </button>
        </div>

        {message && <p className="admin-limits-message">{message}</p>}

        <p className="health-note">
          An in-flight platform round keeps running when this changes — the switch only gates new dispatches. Reaches
          every instance within {relative(limits.propagationMs)}.
        </p>
      </section>
      <PublicPlayPanel onChanged={onChanged} />
    </>
  );
}
