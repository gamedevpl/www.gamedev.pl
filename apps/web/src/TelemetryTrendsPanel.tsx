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
 * Trend strip for the telemetry tab: visits / plays / creations and D7 return
 * over time, with grain and rolling-average toggles.
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
};

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
    return rollupTrends(data.activity, data.retention, grain);
  }, [data, grain]);

  const periodWindow = rollingPeriods(grain, rolling);

  const activitySeries = useMemo(() => {
    const visits = rolled.map((row) => row.visits);
    const plays = rolled.map((row) => row.plays);
    const creations = rolled.map((row) => row.creations);
    if (periodWindow === 0) {
      return [
        { id: 'visits', label: 'Visits', color: COLOR.visits, values: visits },
        { id: 'plays', label: 'Plays', color: COLOR.plays, values: plays },
        { id: 'creations', label: 'Creations', color: COLOR.creations, values: creations },
      ];
    }
    return [
      {
        id: 'visits-avg',
        label: `Visits (${rolling}d avg)`,
        color: COLOR.visits,
        values: rollingAverage(visits, periodWindow),
      },
      {
        id: 'plays-avg',
        label: `Plays (${rolling}d avg)`,
        color: COLOR.plays,
        values: rollingAverage(plays, periodWindow),
      },
      {
        id: 'creations-avg',
        label: `Creations (${rolling}d avg)`,
        color: COLOR.creations,
        values: rollingAverage(creations, periodWindow),
      },
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
          <div className="telem-trends-charts">
            <LineChart
              title="Visits, plays, creations"
              labels={rolled.map((row) => row.label)}
              series={activitySeries}
              emptyMessage="No visit activity in this window."
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
            Activity is UTC day partitions from the visit stream. D7 return is plotted on the day a creator&apos;s
            window closes (publish + 7), so every point is a resolved outcome
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
