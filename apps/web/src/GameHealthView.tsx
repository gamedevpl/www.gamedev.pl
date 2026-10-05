import './operator-telemetry.css';
import type { ReviewerCohort } from '@gamedevpl/contract';
import { useEffect, useState } from 'react';
import {
  fetchGameHealth,
  fetchVisitFunnel,
  fetchCreatorMetrics,
  fetchScorecards,
  type HealthResponse,
  type VisitsResponse,
  type CreatorsResponse,
  type ScorecardsResponse,
} from './healthApi.js';
import { VisitFunnelPanel } from './VisitFunnelPanel.js';
import { CreatorMetricsPanel } from './CreatorMetricsPanel.js';
import { FramePerformancePanel } from './FramePerformancePanel.js';
import { GrowthPanel } from './GrowthPanel.js';
import { ScorecardPanel } from './ScorecardPanel.js';
import { TelemetryOverview } from './TelemetryOverview.js';
import { TelemetryTrendsPanel } from './TelemetryTrendsPanel.js';
import { GameHealthPanel } from './GameHealthPanel.js';

const WINDOWS = [1, 7, 30];
const VIEWS = [
  ['overview', 'Overview', 'Growth and engagement in the selected window.'],
  ['performance', 'Performance', 'FPS and frame gaps by game build and player device.'],
  ['games', 'Game health', 'Play sessions, errors, endings and nightly scorecards.'],
  ['funnels', 'Funnels', 'Where visits and creation flows lose people.'],
  ['creators', 'Creators', 'Publishing, build duration and creator return. Uses its own cohort window.'],
  ['trends', 'Trends', 'Activity and MCP adoption over time. Uses its own date controls.'],
] as const;
type View = (typeof VIEWS)[number][0];

export function GameHealthView() {
  const [view, setView] = useState<View>('overview');
  const [days, setDays] = useState(7);
  const [performanceReviewers, setPerformanceReviewers] = useState<ReviewerCohort>('include');
  const [data, setData] = useState<HealthResponse | null>(null);
  const [visits, setVisits] = useState<VisitsResponse | null>(null);
  const [creators, setCreators] = useState<CreatorsResponse | null>(null);
  const [scorecards, setScorecards] = useState<ScorecardsResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    // Both panels share one window, so they are fetched together and fail together:
    // showing a 30-day funnel above a 7-day table would be worse than showing neither.
    Promise.all([
      fetchGameHealth(days, performanceReviewers),
      fetchVisitFunnel(days),
      fetchCreatorMetrics(),
      fetchScorecards(),
    ])
      .then(([health, funnel, creatorMetrics, sweptScorecards]) => {
        if (cancelled) return;
        if (!health) {
          setState('forbidden');
          return;
        }
        setData(health);
        setVisits(funnel);
        setCreators(creatorMetrics);
        setScorecards(sweptScorecards);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [days, performanceReviewers]);

  if (state === 'forbidden') {
    // Same answer the API gives: nothing here, no hint that there could be.
    return <p className="health-empty">Not found.</p>;
  }

  return (
    <section className="health operator-telemetry">
      <header className="health-header">
        <h2 className="health-section-title">Telemetry</h2>
        <div className="health-windows" hidden={view === 'creators' || view === 'trends'} aria-label="Telemetry window">
          {WINDOWS.map((window) => (
            <button
              key={window}
              type="button"
              className={window === days ? 'health-window is-active' : 'health-window'}
              aria-pressed={window === days}
              onClick={() => setDays(window)}
            >
              {window}d
            </button>
          ))}
        </div>
      </header>

      {state === 'ready' && data && view !== 'creators' && view !== 'trends' && (
        <p className="health-note">
          Window: {data.days[data.days.length - 1]} → {data.days[0]} (UTC).
        </p>
      )}
      <nav className="operator-telemetry-nav" aria-label="Telemetry views">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            aria-controls={`telemetry-${id}`}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <p className="operator-telemetry-description">{VIEWS.find(([id]) => id === view)?.[2]}</p>
      {state === 'loading' && (
        <p className="health-empty" role="status">
          Reading telemetry…
        </p>
      )}
      {state === 'error' && (
        <p className="health-empty" role="alert">
          Could not read telemetry.
        </p>
      )}

      <div id="telemetry-overview" hidden={view !== 'overview'}>
        {state === 'ready' && data && visits && creators?.metrics ? (
          <>
            <TelemetryOverview health={data} visits={visits} creators={creators} />
            <GrowthPanel health={data} visits={visits} creators={creators} />
          </>
        ) : (
          state === 'ready' && <p className="health-empty">Overview data is unavailable.</p>
        )}
      </div>
      <div id="telemetry-performance" hidden={view !== 'performance'}>
        {state === 'ready' &&
          data &&
          (data.performance ? (
            <FramePerformancePanel
              report={data.performance}
              reviewers={performanceReviewers}
              onReviewersChange={setPerformanceReviewers}
            />
          ) : (
            <p className="health-empty">Frame performance data is unavailable.</p>
          ))}
      </div>
      <div id="telemetry-trends" hidden={view !== 'trends'}>
        {state === 'ready' && <TelemetryTrendsPanel />}
      </div>
      <div id="telemetry-creators" hidden={view !== 'creators'}>
        {state === 'ready' &&
          (creators?.metrics ? (
            <CreatorMetricsPanel data={creators} />
          ) : (
            <p className="health-empty">Creator data is unavailable.</p>
          ))}
      </div>
      <div id="telemetry-funnels" hidden={view !== 'funnels'}>
        {state === 'ready' &&
          (visits ? <VisitFunnelPanel data={visits} /> : <p className="health-empty">Funnel data is unavailable.</p>)}
      </div>
      <div id="telemetry-games" hidden={view !== 'games'}>
        {state === 'ready' && scorecards?.scorecards && <ScorecardPanel data={scorecards} />}
        {state === 'ready' && data && <GameHealthPanel data={data} />}
      </div>
    </section>
  );
}
