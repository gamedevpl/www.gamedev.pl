import { useMemo } from 'react';
import type { GameHealth, HealthResponse } from './healthApi.js';
import { formatSeconds } from './relativeTime.js';

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function roundsEnded(game: GameHealth): number {
  return game.outcomes.won + game.outcomes.lost + game.outcomes.quit;
}

function formatScore(value: number): string {
  return Math.abs(value) >= 10_000 ? value.toLocaleString('en-US') : `${Math.round(value * 100) / 100}`;
}

function verdict(game: GameHealth): { label: string; tone: 'bad' | 'warn' | 'ok' | 'idle' } {
  if (game.errors > 0) return { label: 'errors', tone: 'bad' };
  if (game.aliveTicks >= 3 && game.stallRate >= 0.5) return { label: 'stalling', tone: 'bad' };
  if (game.sessions > 0 && game.bounces === game.sessions) return { label: 'all bounced', tone: 'warn' };
  if (game.sessions === 0) return { label: 'no plays', tone: 'idle' };
  return { label: 'ok', tone: 'ok' };
}

export function GameHealthPanel({ data }: { data: HealthResponse }) {
  const totals = useMemo(() => {
    const games = data.games;
    return {
      games: games.length,
      sessions: games.reduce((sum, game) => sum + game.sessions, 0),
      playSeconds: games.reduce((sum, game) => sum + game.totalPlaySeconds, 0),
      erroring: games.filter((game) => game.errors > 0).length,
      rounds: games.reduce((sum, game) => sum + roundsEnded(game), 0),
    };
  }, [data]);

  return (
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
        predates the GameKit that sends them — not that nobody got there. Window: {data.days[data.days.length - 1]} →{' '}
        {data.days[0]}.
      </p>
    </>
  );
}
