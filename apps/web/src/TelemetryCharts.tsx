/**
 * Lean chart primitives for the operator telemetry dashboard.
 *
 * No chart library: the page already answers with numbers, and these exist only to
 * make the same aggregates scannable at a glance — arc length for rates, bar height
 * for bucketed distributions. Both preserve the honesty rules of the surrounding
 * panels: null / empty evidence renders as absence, never as a confident zero.
 */

import { useState } from 'react';

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

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: Array<number | null>;
  /** Dashed stroke — used for rolling averages over the raw series. */
  dashed?: boolean;
  /** Right axis for low-volume series (e.g. creations). */
  axis?: 'left' | 'right';
}

/**
 * Multi-series line chart. Nulls gap the path; optional right axis for low-volume
 * series. Hover shows a day tooltip; legend clicks hide/show a series.
 */
export function LineChart({
  title,
  labels,
  series,
  formatY = (value: number) => String(Math.round(value)),
  formatYRight,
  emptyMessage = 'No data in this window.',
}: {
  title: string;
  labels: string[];
  series: LineSeries[];
  formatY?: (value: number) => string;
  formatYRight?: (value: number) => string;
  emptyMessage?: string;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [hover, setHover] = useState<number | null>(null);

  const width = 640;
  const height = 200;
  const visible = series.filter((s) => !hidden.has(s.id));
  const hasRight = visible.some((s) => (s.axis ?? 'left') === 'right');
  const pad = { top: 16, right: hasRight ? 40 : 12, bottom: 28, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const leftValues = visible
    .filter((s) => (s.axis ?? 'left') === 'left')
    .flatMap((s) => s.values)
    .filter((value): value is number => value !== null);
  const rightValues = visible
    .filter((s) => s.axis === 'right')
    .flatMap((s) => s.values)
    .filter((value): value is number => value !== null);
  const empty = labels.length === 0 || series.every((s) => s.values.every((value) => value === null));
  const noVisible = !empty && visible.length === 0;
  const yMaxLeft = leftValues.length === 0 ? 1 : niceCeil(Math.max(...leftValues, 0));
  const yMaxRight = rightValues.length === 0 ? 1 : niceCeil(Math.max(...rightValues, 0));
  const yMin = 0;
  const rightFormat = formatYRight ?? formatY;

  const xAt = (index: number): number =>
    labels.length <= 1 ? pad.left + innerW / 2 : pad.left + (index / (labels.length - 1)) * innerW;
  const yAtLeft = (value: number): number => pad.top + innerH - ((value - yMin) / (yMaxLeft - yMin || 1)) * innerH;
  const yAtRight = (value: number): number => pad.top + innerH - ((value - yMin) / (yMaxRight - yMin || 1)) * innerH;

  const leftTicks = [0, 0.5, 1].map((fraction) => yMin + (yMaxLeft - yMin) * fraction);
  const rightTicks = [0, 0.5, 1].map((fraction) => yMin + (yMaxRight - yMin) * fraction);
  const labelStep = Math.max(1, Math.ceil(labels.length / 7));

  function toggleSeries(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function indexFromClientX(svg: SVGSVGElement, clientX: number): number | null {
    if (labels.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const localX = ((clientX - rect.left) / rect.width) * width;
    if (localX < pad.left || localX > pad.left + innerW) return null;
    if (labels.length === 1) return 0;
    const ratio = (localX - pad.left) / innerW;
    return Math.max(0, Math.min(labels.length - 1, Math.round(ratio * (labels.length - 1))));
  }

  const hoverLabel = hover === null ? null : labels[hover];
  const tooltipRows =
    hover === null
      ? []
      : visible
          .map((s) => {
            const value = s.values[hover];
            if (value === null || value === undefined) return null;
            const format = s.axis === 'right' ? rightFormat : formatY;
            return { id: s.id, label: s.label, color: s.color, text: format(value) };
          })
          .filter((row): row is { id: string; label: string; color: string; text: string } => row !== null);

  // Pin tooltip near the column; flip left near the right edge.
  const tooltipStyle =
    hover === null
      ? undefined
      : {
          left: `${(Math.min(xAt(hover), pad.left + innerW * 0.62) / width) * 100}%`,
        };

  return (
    <figure className="telem-line">
      <figcaption className="telem-line-title">{title}</figcaption>
      {empty ? (
        <p className="health-empty">{emptyMessage}</p>
      ) : (
        <>
          <div className="telem-line-plot">
            <svg
              className="telem-line-svg"
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`${title}: ${series.map((s) => s.label).join(', ')}`}
              onMouseMove={(event) => {
                const index = indexFromClientX(event.currentTarget, event.clientX);
                setHover(index);
              }}
              onMouseLeave={() => setHover(null)}
            >
              {leftTicks.map((tick) => (
                <g key={`L${tick}`}>
                  <line
                    className="telem-line-grid"
                    x1={pad.left}
                    x2={pad.left + innerW}
                    y1={yAtLeft(tick)}
                    y2={yAtLeft(tick)}
                  />
                  <text className="telem-line-axis" x={pad.left - 6} y={yAtLeft(tick) + 3} textAnchor="end">
                    {formatY(tick)}
                  </text>
                </g>
              ))}
              {hasRight &&
                rightTicks.map((tick) => (
                  <text
                    key={`R${tick}`}
                    className="telem-line-axis telem-line-axis--right"
                    x={pad.left + innerW + 6}
                    y={yAtRight(tick) + 3}
                    textAnchor="start"
                  >
                    {rightFormat(tick)}
                  </text>
                ))}
              {visible.map((s) => {
                const yAt = s.axis === 'right' ? yAtRight : yAtLeft;
                return (
                  <path
                    key={s.id}
                    className={s.dashed ? 'telem-line-path is-dashed' : 'telem-line-path'}
                    d={linePath(s.values, xAt, yAt)}
                    stroke={s.color}
                    fill="none"
                  />
                );
              })}
              {hover !== null && (
                <line
                  className="telem-line-crosshair"
                  x1={xAt(hover)}
                  x2={xAt(hover)}
                  y1={pad.top}
                  y2={pad.top + innerH}
                />
              )}
              {hover !== null &&
                visible.map((s) => {
                  const value = s.values[hover];
                  if (value === null || value === undefined) return null;
                  const yAt = s.axis === 'right' ? yAtRight : yAtLeft;
                  return (
                    <circle
                      key={`dot-${s.id}`}
                      className="telem-line-dot"
                      cx={xAt(hover)}
                      cy={yAt(value)}
                      r={3.5}
                      fill={s.color}
                    />
                  );
                })}
              {labels.map((label, index) =>
                index % labelStep === 0 || index === labels.length - 1 ? (
                  <text
                    key={`${label}-${index}`}
                    className="telem-line-axis"
                    x={xAt(index)}
                    y={height - 8}
                    textAnchor="middle"
                  >
                    {label}
                  </text>
                ) : null,
              )}
              {/* Transparent hit target over the plot area. */}
              <rect
                className="telem-line-hit"
                x={pad.left}
                y={pad.top}
                width={innerW}
                height={innerH}
                fill="transparent"
              />
            </svg>
            {hover !== null && hoverLabel !== undefined && tooltipRows.length > 0 && (
              <div className="telem-line-tooltip" style={tooltipStyle} role="status">
                <div className="telem-line-tooltip-label">{hoverLabel}</div>
                <ul>
                  {tooltipRows.map((row) => (
                    <li key={row.id}>
                      <span className="telem-line-tooltip-swatch" style={{ background: row.color }} />
                      <span className="telem-line-tooltip-name">{row.label}</span>
                      <span className="telem-line-tooltip-value">{row.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {noVisible && (
              <p className="telem-line-hidden-note">All series hidden — click a legend item to show one.</p>
            )}
          </div>
          <ul className="telem-line-legend">
            {series.map((s) => {
              const isHidden = hidden.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={isHidden ? 'telem-line-legend-btn is-off' : 'telem-line-legend-btn'}
                    aria-pressed={!isHidden}
                    onClick={() => toggleSeries(s.id)}
                  >
                    <span
                      className={s.dashed ? 'telem-line-swatch is-dashed' : 'telem-line-swatch'}
                      style={{ background: s.color, borderColor: s.color }}
                    />
                    {s.label}
                    {s.axis === 'right' ? <span className="telem-line-axis-tag">right</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </figure>
  );
}

/** Polyline that gaps across nulls instead of dropping to zero. */
function linePath(
  values: Array<number | null>,
  xAt: (index: number) => number,
  yAt: (value: number) => number,
): string {
  let d = '';
  let drawing = false;
  values.forEach((value, index) => {
    if (value === null) {
      drawing = false;
      return;
    }
    const command = drawing ? 'L' : 'M';
    d += `${command}${xAt(index)} ${yAt(value)} `;
    drawing = true;
  });
  return d.trim();
}

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}
