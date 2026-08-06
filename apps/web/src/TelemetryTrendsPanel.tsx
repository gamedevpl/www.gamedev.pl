import { useEffect, useMemo, useState } from 'react';
import { fetchTelemetryTrends, type TrendsResponse } from './healthApi.js';
import { LineChart } from './TelemetryCharts.js';
import {
  rollingAverage,
  rollingPeriods,
  rollupTrends,
  type RollingWindow,
  type TrendGrain,
} from './telemetryTrends.js';

/**
 * Trend strip for the telemetry tab: visits / plays / creations, MCP adoption,
 * and D7 return over time, with grain and rolling-average toggles.
 *
 * Fetches its own window (30 / 90 days) rather than sharing the funnel's 1/7/30
 * selector — a one-day trend chart is not a trend chart.
 */

const WINDOWS = [30, 90] as const;
const GRAINS: Array<{ id: TrendGrain; label: string }> = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];
const ROLLING: Array<{ id: RollingWindow; label: string }> = [
  { id: 0, label: 'Raw' },
  { id: 7, label: '7d avg' },
  { id: 28, label: '28d avg' },
];

const COLOR = {
  visits: 'var(--turquoise)',
  plays: 'var(--accent-blue)',
  creations: '#fbbf24',
  retention: 'var(--turquoise)',
  selfChosen: 'var(--accent-blue)',
  connected: '#fbbf24',
  signaled: 'var(--turquoise)',
  gate: '#c084fc',
};

function maybeRoll(values: number[], periodWindow: number, rolling: RollingWindow, label: string, color: string) {
  if (periodWindow === 0) {
    return { id: label.toLowerCase().replace(/\s+/g, '-'), label, color, values };
  }
  return {
    id: `${label.toLowerCase().replace(/\s+/g, '-')}-avg`,
    label: `${label} (${rolling}d avg)`,
    color,
    values: rollingAverage(values, periodWindow),
  };
}

export function TelemetryTrendsPanel() {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [grain, setGrain] = useState<TrendGrain>('day');
  const [rolling, setRolling] = useState<RollingWindow>(7);
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchTelemetryTrends(days)
      .then((response) => {
        if (cancelled) return;
        if (!response) {
          setState('forbidden');
          return;
        }
        setData(response);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const rolled = useMemo(() => {
    if (!data) return [];
    return rollupTrends(data.activity, data.mcp ?? [], data.retention, grain);
  }, [data, grain]);

  const periodWindow = rollingPeriods(grain, rolling);

  const totals = useMemo(() => {
    const selfChosen = rolled.reduce((sum, row) => sum + row.selfChosen, 0);
    const platformChosen = rolled.reduce((sum, row) => sum + row.platformChosen, 0);
    const connected = rolled.reduce((sum, row) => sum + row.connected, 0);
    const signaled = rolled.reduce((sum, row) => sum + row.signaled, 0);
    const chosen = selfChosen + platformChosen;
    return {
      selfChosen,
      platformChosen,
      connected,
      signaled,
      selfShare: chosen === 0 ? null : selfChosen / chosen,
      connectToSignal: connected === 0 ? null : signaled / connected,
    };
  }, [rolled]);

  const activitySeries = useMemo(() => {
    const visits = rolled.map((row) => row.visits);
    const plays = rolled.map((row) => row.plays);
    const creations = rolled.map((row) => row.creations);
    const visitsSeries = maybeRoll(visits, periodWindow, rolling, 'Visits', COLOR.visits);
    const playsSeries = maybeRoll(plays, periodWindow, rolling, 'Plays', COLOR.plays);
    const creationsSeries = {
      ...maybeRoll(creations, periodWindow, rolling, 'Creations', COLOR.creations),
      axis: 'right' as const,
    };
    return [visitsSeries, playsSeries, creationsSeries];
  }, [rolled, periodWindow, rolling]);

  const mcpSeries = useMemo(() => {
    return [
      maybeRoll(
        rolled.map((row) => row.selfChosen),
        periodWindow,
        rolling,
        'Self chosen',
        COLOR.selfChosen,
      ),
      maybeRoll(
        rolled.map((row) => row.connected),
        periodWindow,
        rolling,
        'Connected',
        COLOR.connected,
      ),
      maybeRoll(
        rolled.map((row) => row.signaled),
        periodWindow,
        rolling,
        'Agent signaled',
        COLOR.signaled,
      ),
      maybeRoll(
        rolled.map((row) => row.gateVerdicts),
        periodWindow,
        rolling,
        'Gate verdicts',
        COLOR.gate,
      ),
    ];
  }, [rolled, periodWindow, rolling]);

  const retentionSeries = useMemo(() => {
    const rates = rolled.map((row) => row.retentionRate);
    if (periodWindow === 0) {
      return [{ id: 'd7', label: 'D7 return', color: COLOR.retention, values: rates }];
    }
    return [
      {
        id: 'd7-avg',
        label: `D7 return (${rolling}d avg)`,
        color: COLOR.retention,
        values: rollingAverage(rates, periodWindow),
      },
    ];
  }, [rolled, periodWindow, rolling]);

  if (state === 'forbidden') return null;

  return (
    <section className="telem-trends" aria-label="Telemetry trends">
      <header className="telem-trends-header">
        <h2 className="telem-trends-title">Trends</h2>
        <div className="telem-trends-controls">
          <div className="health-windows" role="group" aria-label="Trend window">
            {WINDOWS.map((window) => (
              <button
                key={window}
                type="button"
                className={window === days ? 'health-window is-active' : 'health-window'}
                onClick={() => setDays(window)}
              >
                {window}d
              </button>
            ))}
          </div>
          <div className="health-windows" role="group" aria-label="Grain">
            {GRAINS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.id === grain ? 'health-window is-active' : 'health-window'}
                onClick={() => setGrain(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="health-windows" role="group" aria-label="Rolling average">
            {ROLLING.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.id === rolling ? 'health-window is-active' : 'health-window'}
                onClick={() => setRolling(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {state === 'loading' && <p className="health-empty">Reading trends…</p>}
      {state === 'error' && <p className="health-empty">Could not read trends.</p>}

      {state === 'ready' && data && (
        <>
          <ul className="telem-trends-kpis">
            <li>
              <span className="telem-trends-kpi-value">
                {totals.selfShare === null ? '—' : `${Math.round(totals.selfShare * 100)}%`}
              </span>
              <span className="telem-trends-kpi-label">chose self (MCP)</span>
            </li>
            <li>
              <span className="telem-trends-kpi-value">{totals.connected}</span>
              <span className="telem-trends-kpi-label">connected</span>
            </li>
            <li>
              <span className="telem-trends-kpi-value">{totals.signaled}</span>
              <span className="telem-trends-kpi-label">agent signaled</span>
            </li>
            <li>
              <span className="telem-trends-kpi-value">
                {totals.connectToSignal === null ? '—' : `${Math.round(totals.connectToSignal * 100)}%`}
              </span>
              <span className="telem-trends-kpi-label">connect → signal</span>
            </li>
          </ul>

          <div className="telem-trends-charts">
            <LineChart
              title="Visits & plays (creations on right)"
              labels={rolled.map((row) => row.label)}
              series={activitySeries}
              emptyMessage="No visit activity in this window."
            />
            <LineChart
              title="MCP adoption (self-build)"
              labels={rolled.map((row) => row.label)}
              series={mcpSeries}
              emptyMessage="No studio / MCP steps in this window."
            />
            <LineChart
              title="Creator D7 return"
              labels={rolled.map((row) => row.label)}
              series={retentionSeries}
              formatY={(value) => `${Math.round(value * 100)}%`}
              emptyMessage="No creator cohort has closed its 7-day window in this range."
            />
          </div>
          <p className="health-note">
            Activity and MCP rungs are UTC day partitions from the visit stream (`studio_step` for self-build). D7
            return is plotted on the day a creator&apos;s window closes (publish + 7), so every point is a resolved
            outcome
            {data.days.length > 0 && (
              <>
                . Window: {data.days[0]} → {data.days[data.days.length - 1]}
              </>
            )}
            {data.truncated && <>. A day hit the read cap, so some counts are a floor</>}.
          </p>
        </>
      )}
    </section>
  );
}
