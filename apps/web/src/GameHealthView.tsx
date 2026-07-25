import { useEffect, useMemo, useState } from 'react';
import { fetchGameHealth, type GameHealth, type HealthResponse } from './healthApi';

/**
 * Operator view over play telemetry (docs/improvement-loop-plan.md IL-2).
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

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
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
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchGameHealth(days)
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

  const totals = useMemo(() => {
    const games = data?.games ?? [];
    return {
      games: games.length,
      sessions: games.reduce((sum, game) => sum + game.sessions, 0),
      playSeconds: games.reduce((sum, game) => sum + game.totalPlaySeconds, 0),
      erroring: games.filter((game) => game.errors > 0).length,
    };
  }, [data]);

  if (state === 'forbidden') {
    // Same answer the API gives: nothing here, no hint that there could be.
    return <p className="health-empty">Not found.</p>;
  }

  return (
    <section className="health">
      <header className="health-header">
        <h1>Game health</h1>
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

      {state === 'ready' && data && (
        <>
          <p className="health-summary">
            {totals.games} game{totals.games === 1 ? '' : 's'} played · {totals.sessions} session
            {totals.sessions === 1 ? '' : 's'} · {formatSeconds(totals.playSeconds)} of play
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
                    <th>FPS</th>
                    <th>Stalled</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {data.games.map((game) => {
                    const badge = verdict(game);
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
                        <td>{game.medianFps === null ? '—' : Math.round(game.medianFps)}</td>
                        <td title={`${game.stalledTicks} of ${game.aliveTicks} ticks`}>
                          {game.aliveTicks === 0 ? '—' : percent(game.stallRate)}
                        </td>
                        <td>
                          {game.errors === 0 ? (
                            '—'
                          ) : (
                            <details className="health-errors">
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
            . Window: {data.days[data.days.length - 1]} → {data.days[0]}.
          </p>
        </>
      )}
    </section>
  );
}
