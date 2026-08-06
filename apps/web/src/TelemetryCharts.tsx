/**
 * Lean chart primitives for the operator telemetry dashboard.
 *
 * No chart library: the page already answers with numbers, and these exist only to
 * make the same aggregates scannable at a glance — arc length for rates, bar height
 * for bucketed distributions. Both preserve the honesty rules of the surrounding
 * panels: null / empty evidence renders as absence, never as a confident zero.
 */

export type GaugeTone = 'ok' | 'warn' | 'bad' | 'idle';

/** Semicircle rate gauge. `value` is a 0–1 fraction; null means no evidence. */
export function Gauge({
  value,
  label,
  display,
  tone = 'ok',
  target,
}: {
  value: number | null;
  /** Visible number in the middle — already formatted by the caller. */
  display: string;
  label: string;
  tone?: GaugeTone;
  /** Optional goal on the same 0–1 scale (drawn as a tick on the arc). */
  target?: number;
}) {
  const clamped = value === null ? null : Math.max(0, Math.min(1, value));
  // Polar arc from 180° (left) to 0° (right). A dash for the missing case keeps the
  // track drawn so the empty slot still reads as a gauge, not a missing widget.
  const sweep = clamped === null ? 0 : clamped * 180;
  const targetAngle = target === undefined ? null : 180 - Math.max(0, Math.min(1, target)) * 180;

  return (
    <figure className={`telem-gauge telem-gauge--${tone}${clamped === null ? ' is-empty' : ''}`}>
      <svg className="telem-gauge-svg" viewBox="0 0 120 78" role="img" aria-label={`${label}: ${display}`}>
        <path className="telem-gauge-track" d={arcPath(60, 64, 44, 180, 0)} fill="none" />
        {sweep > 0 && <path className="telem-gauge-fill" d={arcPath(60, 64, 44, 180, 180 - sweep)} fill="none" />}
        {targetAngle !== null && (
          <line
            className="telem-gauge-target"
            x1={60 + Math.cos((targetAngle * Math.PI) / 180) * 36}
            y1={64 - Math.sin((targetAngle * Math.PI) / 180) * 36}
            x2={60 + Math.cos((targetAngle * Math.PI) / 180) * 52}
            y2={64 - Math.sin((targetAngle * Math.PI) / 180) * 52}
          />
        )}
        <text className="telem-gauge-value" x="60" y="58" textAnchor="middle">
          {display}
        </text>
      </svg>
      <figcaption className="telem-gauge-label">{label}</figcaption>
    </figure>
  );
}

/**
 * Open-scale dial for unbounded coefficients like growth k.
 *
 * The track runs 0 → `max`; a goal tick marks the sustainability threshold (1).
 * Values above `max` pin the needle at the end rather than inventing a new scale
 * mid-glance — the number in the middle is still the truth.
 */
export function OpenGauge({
  value,
  label,
  display,
  max,
  goal,
  tone = 'ok',
}: {
  value: number | null;
  display: string;
  label: string;
  max: number;
  goal?: number;
  tone?: GaugeTone;
}) {
  const ratio = value === null || max <= 0 ? null : Math.max(0, Math.min(1, value / max));
  const sweep = ratio === null ? 0 : ratio * 180;
  const goalAngle = goal === undefined || max <= 0 ? null : 180 - Math.max(0, Math.min(1, goal / max)) * 180;

  return (
    <figure className={`telem-gauge telem-gauge--${tone}${ratio === null ? ' is-empty' : ''}`}>
      <svg className="telem-gauge-svg" viewBox="0 0 120 78" role="img" aria-label={`${label}: ${display}`}>
        <path className="telem-gauge-track" d={arcPath(60, 64, 44, 180, 0)} fill="none" />
        {sweep > 0 && <path className="telem-gauge-fill" d={arcPath(60, 64, 44, 180, 180 - sweep)} fill="none" />}
        {goalAngle !== null && (
          <line
            className="telem-gauge-target"
            x1={60 + Math.cos((goalAngle * Math.PI) / 180) * 36}
            y1={64 - Math.sin((goalAngle * Math.PI) / 180) * 36}
            x2={60 + Math.cos((goalAngle * Math.PI) / 180) * 52}
            y2={64 - Math.sin((goalAngle * Math.PI) / 180) * 52}
          />
        )}
        <text className="telem-gauge-value" x="60" y="58" textAnchor="middle">
          {display}
        </text>
      </svg>
      <figcaption className="telem-gauge-label">{label}</figcaption>
    </figure>
  );
}

export interface HistogramBar {
  label: string;
  value: number;
}

/** Vertical bar histogram for a small, fixed set of buckets. */
export function Histogram({
  title,
  bars,
  emptyMessage = 'No data.',
  unit = 'visits',
}: {
  title: string;
  bars: HistogramBar[];
  emptyMessage?: string;
  unit?: string;
}) {
  const max = bars.reduce((peak, bar) => Math.max(peak, bar.value), 0);
  const total = bars.reduce((sum, bar) => sum + bar.value, 0);

  return (
    <figure className="telem-histogram">
      <figcaption className="telem-histogram-title">{title}</figcaption>
      {total === 0 || bars.length === 0 ? (
        <p className="health-empty">{emptyMessage}</p>
      ) : (
        <div
          className="telem-histogram-plot"
          role="img"
          aria-label={`${title}: ${bars.map((bar) => `${bar.label} ${bar.value} ${unit}`).join(', ')}`}
        >
          {bars.map((bar) => {
            const heightPct = max === 0 ? 0 : (bar.value / max) * 100;
            return (
              <div key={bar.label} className="telem-histogram-col">
                <span className="telem-histogram-count">{bar.value}</span>
                <div className="telem-histogram-track" aria-hidden="true">
                  <div className="telem-histogram-bar" style={{ height: `${heightPct}%` }} />
                </div>
                <span className="telem-histogram-label">{bar.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </figure>
  );
}

/** SVG arc path from `startAngle` to `endAngle` (degrees, 0 = east, CCW). */
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const large = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  // Sweep-flag 1 = clockwise in SVG — we walk from left (180°) toward right (0°).
  const sweep = startAngle > endAngle ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} ${sweep} ${end.x} ${end.y}`;
}

function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}
