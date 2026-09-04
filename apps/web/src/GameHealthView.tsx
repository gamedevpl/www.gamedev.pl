import { useEffect, useMemo, useState } from 'react';
import {
  fetchGameHealth,
  fetchVisitFunnel,
  fetchCreatorMetrics,
  fetchScorecards,
  type GameHealth,
  type HealthResponse,
  type VisitsResponse,
  type CreatorsResponse,
  type ScorecardsResponse,
} from './healthApi.js';
import { VisitFunnelPanel } from './VisitFunnelPanel.js';
import { CreatorMetricsPanel } from './CreatorMetricsPanel.js';
import { GrowthPanel } from './GrowthPanel.js';
import { ScorecardPanel } from './ScorecardPanel.js';
import { TelemetryOverview } from './TelemetryOverview.js';
import { TelemetryTrendsPanel } from './TelemetryTrendsPanel.js';
import { formatSeconds } from './relativeTime.js';

/**
 * Operator view over play telemetry (docs/improvement-loop-plan.md IL-2).
 *
 * The telemetry section of the console (see AdminConsole) — it was the whole operator
 * page before there was a console, which is why `/health` still resolves to it.
 *
 * Deliberately not translated: this is a single-operator surface, not a product one,
 * and adding a dozen keys to every locale for a page no player can reach would cost
 * more than it explains.
 *
 * The table's job is to answer one question at a glance — which published game is
 * broken or ignored — so games that error or stall sort to the top and everything
 * else is context for those rows.
 */

const WINDOWS = [1, 7, 30];

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * Rounds this game was seen to conclude — the test for whether its depth columns mean
 * anything at all.
 *
 * Zero is ambiguous by nature: a game that emits no endings and a game nobody ever
 * finishes produce identical rows. Most of the catalog is still the former, so the
 * columns below render `—` (no evidence) rather than `0%` (a damning claim) whenever this
 * is zero. It is also why no verdict badge reads off finish rate: "nobody finishes this"
 * is not a conclusion the data supports yet.
 */
function roundsEnded(game: GameHealth): number {
  return game.outcomes.won + game.outcomes.lost + game.outcomes.quit;
}

function formatScore(value: number): string {
  return Math.abs(value) >= 10_000 ? value.toLocaleString('en-US') : `${Math.round(value * 100) / 100}`;
}

/**
 * A game's headline state. Errors outrank stalls because an uncaught exception is a
 * fact about one session, while a stall rate needs several ticks before it means much.
 */
function verdict(game: GameHealth): { label: string; tone: 'bad' | 'warn' | 'ok' | 'idle' } {
  if (game.errors > 0) return { label: 'errors', tone: 'bad' };
  if (game.aliveTicks >= 3 && game.stallRate >= 0.5) return { label: 'stalling', tone: 'bad' };
  if (game.sessions > 0 && game.bounces === game.sessions) return { label: 'all bounced', tone: 'warn' };
  if (game.sessions === 0) return { label: 'no plays', tone: 'idle' };
  return { label: 'ok', tone: 'ok' };
}

export function GameHealthView() {
  const [days, setDays] = useState(7);
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
    Promise.all([fetchGameHealth(days), fetchVisitFunnel(days), fetchCreatorMetrics(), fetchScorecards()])
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
  }, [days]);

  const totals = useMemo(() => {
    const games = data?.games ?? [];
    return {
      games: games.length,
      sessions: games.reduce((sum, game) => sum + game.sessions, 0),
      playSeconds: games.reduce((sum, game) => sum + game.totalPlaySeconds, 0),
      erroring: games.filter((game) => game.errors > 0).length,
      rounds: games.reduce((sum, game) => sum + roundsEnded(game), 0),
    };
  }, [data]);

  if (state === 'forbidden') {
    // Same answer the API gives: nothing here, no hint that there could be.
    return <p className="health-empty">Not found.</p>;
  }

  return (
    <section className="health">
      <header className="health-header">
        {/* A section of the console now, not a page: the console owns the title, the
            alerts and the queue, and this is the telemetry inside it. */}
        <h2 className="health-section-title">Telemetry</h2>
        <div className="health-windows">
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
      </header>

      {state === 'loading' && <p className="health-empty">Reading telemetry…</p>}
      {state === 'error' && <p className="health-empty">Could not read telemetry.</p>}

      {/*
        Guarded on `metrics` rather than just truthiness: these three reads share one
        Promise.all and one error state, so a creators payload of an unexpected shape
        would otherwise blank the game-health table too.
      */}
      {/* Overview first: gauges + distribution histograms, then the panels that
          carry the same numbers in prose. Needs all three reads — same gate as Growth. */}
      {state === 'ready' && data && visits && creators?.metrics && (
        <TelemetryOverview health={data} visits={visits} creators={creators} />
      )}

      {state === 'ready' && <TelemetryTrendsPanel />}

      {/* The one business number, above the panels that carry its ingredients. Needs all
          three reads at once — it is their product — so it simply stays absent when any
          of them failed to load. */}
      {state === 'ready' && data && visits && creators?.metrics && (
        <GrowthPanel health={data} visits={visits} creators={creators} />
      )}

      {state === 'ready' && creators?.metrics && <CreatorMetricsPanel data={creators} />}

      {state === 'ready' && visits && <VisitFunnelPanel data={visits} />}

      {/* Above the game-health table on purpose: this is the only place a stopped sweep
          is visible, and the table below always looks current because it recomputes.

          Guarded on `scorecards.scorecards` rather than truthiness, for the same reason
          the creators panel is: all four reads share one Promise.all and one error
          state, so a payload of an unexpected shape would blank the health table too. */}
      {state === 'ready' && scorecards?.scorecards && <ScorecardPanel data={scorecards} />}

      {state === 'ready' && data && (
        <>
          <h2 className="health-section-title">Game health</h2>
          <p className="health-summary">
            {totals.games} game{totals.games === 1 ? '' : 's'} played · {totals.sessions} session
            {totals.sessions === 1 ? '' : 's'} · {formatSeconds(totals.playSeconds)} of play
            {totals.rounds > 0 && (
              <>
                {' '}
                · {totals.rounds} round{totals.rounds === 1 ? '' : 's'} finished
              </>
            )}
            {totals.erroring > 0 && <> · {totals.erroring} erroring</>}
          </p>
          {data.truncated && (
            <p className="health-note">A day hit the read cap, so these counts are a floor rather than a total.</p>
          )}

          {data.games.length === 0 ? (
            <p className="health-empty">No play recorded in this window.</p>
          ) : (
            <div className="health-table-scroll">
              <table className="health-table">
                <thead>
                  <tr>
                    <th>Game</th>
                    <th></th>
                    <th>Sessions</th>
                    <th>Bounced</th>
                    <th>Median play</th>
                    <th>Finished</th>
                    <th>Won</th>
                    <th>Best score</th>
                    <th title="Sessions issued a seat in a shared world that actually got one">Shared</th>
                    <th>Progress</th>
                    <th>FPS</th>
                    <th>Stalled</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {data.games.map((game) => {
                    const badge = verdict(game);
                    const ended = roundsEnded(game);
                    return (
                      <tr key={game.slug}>
                        <td className="health-slug">
                          <a href={`/play/${game.slug}`}>{game.slug}</a>
                        </td>
                        <td>
                          <span className={`health-badge health-badge--${badge.tone}`}>{badge.label}</span>
                        </td>
                        <td>{game.sessions}</td>
                        <td>{game.bounces > 0 ? `${game.bounces}` : '—'}</td>
                        <td>{game.medianPlaySeconds > 0 ? formatSeconds(game.medianPlaySeconds) : '—'}</td>
                        <td title={ended === 0 ? undefined : `${game.sessionsWithEnding} of ${game.sessions} sessions`}>
                          {ended === 0 ? '—' : percent(game.finishRate)}
                        </td>
                        <td
                          title={
                            game.winRate === null
                              ? undefined
                              : `${game.outcomes.won} won, ${game.outcomes.lost} lost, ${game.outcomes.quit} quit`
                          }
                        >
                          {game.winRate === null ? '—' : percent(game.winRate)}
                        </td>
                        <td>{game.medianBestScore === null ? '—' : formatScore(game.medianBestScore)}</td>
                        {/*
                          Below 100% is players who were promised company and played alone:
                          the shell's fallback to solo is silent by design, so this column
                          is the only place in the product where that shows. A game with no
                          zone reads '—', never 0%, exactly as Finished does.
                        */}
                        <td
                          title={
                            game.zoneJoinRate === null
                              ? undefined
                              : `${game.zoneJoined} of ${game.zoneAdmitted} admitted sessions reached a world`
                          }
                        >
                          {game.zoneJoinRate === null ? '—' : percent(game.zoneJoinRate)}
                        </td>
                        <td>
                          {game.progressLabels.length === 0 ? (
                            '—'
                          ) : (
                            <details className="health-disclosure">
                              <summary>{game.progressLabels.length}</summary>
                              <ul>
                                {game.progressLabels.map((landmark) => (
                                  <li key={landmark.label}>
                                    <span className="health-error-count">{landmark.sessions}×</span> {landmark.label}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </td>
                        <td>{game.medianFps === null ? '—' : Math.round(game.medianFps)}</td>
                        <td title={`${game.stalledTicks} of ${game.aliveTicks} ticks`}>
                          {game.aliveTicks === 0 ? '—' : percent(game.stallRate)}
                        </td>
                        <td>
                          {game.errors === 0 ? (
                            '—'
                          ) : (
                            <details className="health-disclosure health-errors">
                              <summary>{game.errors}</summary>
                              <ul>
                                {game.errorSamples.map((sample) => (
                                  <li key={sample.message}>
                                    <span className="health-error-count">{sample.count}×</span> {sample.message}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="health-note">
            Play time counts only while the tab is focused. Liveness ticks recorded right after a gap are discarded as
            resume artifacts rather than counted as stalls
            {data.games.some((game) => game.resumeTicksIgnored > 0) && (
              <> ({data.games.reduce((sum, game) => sum + game.resumeTicksIgnored, 0)} discarded in this window)</>
            )}
            . A dash under Finished, Won or Best score means the game reported no endings at all — most of the catalog
            predates the GameKit that sends them — not that nobody got there. Window: {data.days[data.days.length - 1]}{' '}
            → {data.days[0]}.
          </p>
        </>
      )}
    </section>
  );
}
