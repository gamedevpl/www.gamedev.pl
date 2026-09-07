import type { CreationLimits } from './adminApi.js';

// What the spend brake can pull; see PAUSEABLE in spend-brake.ts.
const LANES = [
  { key: 'editingPaused', label: 'editing' },
  { key: 'chatPaused', label: 'chat' },
  { key: 'searchPaused', label: 'search' },
  { key: 'gatePaused', label: 'gate runs' },
  { key: 'dreamsPaused', label: 'concept art' },
] as const;

export type IncidentLanePatch = { [K in (typeof LANES)[number]['key']]?: boolean };

// Every pause the brake can apply gets a visible way out here.
export function IncidentLanesPanel({
  effective,
  busy,
  message,
  propagation,
  onToggle,
}: {
  effective: CreationLimits['effective'];
  busy: boolean;
  message: string | null;
  propagation: string;
  onToggle: (patch: IncidentLanePatch) => void;
}) {
  const lanes = LANES.map((lane) => ({ ...lane, paused: effective[lane.key] === true }));
  const paused = lanes.filter((lane) => lane.paused);
  return (
    <section className="admin-limits">
      <h2 className="health-section-title">Incident lanes</h2>
      <p className="health-summary">
        {paused.length ? `Paused: ${paused.map((lane) => lane.label).join(', ')}.` : 'Every lane is open.'}
      </p>

      <div className="admin-limits-controls">
        {lanes.map((lane) => (
          <button
            key={lane.key}
            type="button"
            className={lane.paused ? 'admin-limits-resume' : 'admin-limits-pause'}
            disabled={busy}
            onClick={() => onToggle({ [lane.key]: !lane.paused })}
          >
            {lane.paused ? `Resume ${lane.label}` : `Pause ${lane.label}`}
          </button>
        ))}
      </div>

      {message && <p className="admin-limits-message">{message}</p>}

      <p className="health-note">
        The spend brake pauses these when a spend alert opens and never resumes them. Resume here once the cause is
        understood. Reaches every instance within {propagation}.
      </p>
    </section>
  );
}
