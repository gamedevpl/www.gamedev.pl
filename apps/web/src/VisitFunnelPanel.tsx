import { type VisitFunnel, type VisitsResponse } from './healthApi';

/**
 * The visit funnel, rendered beside game health on the operator page.
 *
 * Game health answers "is this game working". This answers the questions that come
 * before that and which no per-game view can reach: how many arrivals there were, how
 * many reached a game at all, how fast, how deep, and where they came from.
 *
 * Untranslated for the same reason as the rest of this page — a single-operator
 * surface no player can reach.
 */

function percent(part: number, whole: number): string {
  if (whole === 0) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

/** Human labels for the creation steps; the API sends the machine names. */
const STEP_LABELS: Record<string, string> = {
  prompt_started: 'started writing',
  spec_submitted: 'pressed create',
  signin_required: 'hit sign-in wall',
  qa_shown: 'asked questions',
  submission_created: 'game submitted',
};

function bucketLabel(upToSeconds: number | null): string {
  if (upToSeconds === null) return 'slower';
  if (upToSeconds < 60) return `≤ ${upToSeconds}s`;
  return `≤ ${Math.round(upToSeconds / 60)}m`;
}

/** A labelled count with its share of visits, for the small ranked tables. */
function RankedRows({ rows, whole }: { rows: Array<{ label: string; visits: number; plays: number }>; whole: number }) {
  return (
    <tbody>
      {rows.map((row) => (
        <tr key={row.label}>
          <td>{row.label}</td>
          <td className="num">{row.visits}</td>
          <td className="num">{percent(row.visits, whole)}</td>
          <td className="num">{row.plays}</td>
        </tr>
      ))}
    </tbody>
  );
}

export function VisitFunnelPanel({ data }: { data: VisitsResponse }) {
  const funnel: VisitFunnel = data.funnel;

  if (funnel.visits === 0) {
    return (
      <section className="funnel">
        <h2>Visits</h2>
        <p className="health-empty">No visits recorded in this window.</p>
      </section>
    );
  }

  const campaignRows = funnel.campaigns.map((row) => ({
    label: [row.source, row.medium, row.campaign].filter(Boolean).join(' / ') || 'unnamed',
    visits: row.visits,
    plays: row.plays,
  }));

  return (
    <section className="funnel">
      <h2>Visits</h2>

      <ul className="funnel-stats">
        <li>
          <span className="funnel-stat-value">{funnel.visits}</span>
          <span className="funnel-stat-label">visits</span>
        </li>
        <li>
          <span className="funnel-stat-value">{percent(funnel.visitsWithPlay, funnel.visits)}</span>
          <span className="funnel-stat-label">reached a game</span>
        </li>
        <li>
          <span className="funnel-stat-value">{funnel.bounces}</span>
          <span className="funnel-stat-label">left without playing</span>
        </li>
        <li>
          <span className="funnel-stat-value">
            {funnel.visitsWithPlay > 0 ? `${funnel.medianSecondsToFirstPlay}s` : '—'}
          </span>
          <span className="funnel-stat-label">median to first play</span>
        </li>
        <li>
          <span className="funnel-stat-value">
            {funnel.visitsWithPlay > 0 ? funnel.medianPlaysPerPlayingVisit : '—'}
          </span>
          <span className="funnel-stat-label">median games / playing visit</span>
        </li>
      </ul>

      <div className="funnel-grid">
        <div className="funnel-block">
          <h3>Time to first play</h3>
          {funnel.timeToFirstPlay.length === 0 ? (
            <p className="health-empty">No visit reached a game.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Within</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                </tr>
              </thead>
              <tbody>
                {funnel.timeToFirstPlay.map((row) => (
                  <tr key={String(row.upToSeconds)}>
                    <td>{bucketLabel(row.upToSeconds)}</td>
                    <td className="num">{row.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="funnel-block">
          <h3>Games per visit</h3>
          {funnel.depth.length === 0 ? (
            <p className="health-empty">No visit reached a game.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Games</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                </tr>
              </thead>
              <tbody>
                {funnel.depth.map((row) => (
                  <tr key={row.plays}>
                    <td>{row.plays}</td>
                    <td className="num">{row.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="funnel-block">
          <h3>Creating</h3>
          {funnel.creating.every((row) => row.visits === 0) ? (
            <p className="health-empty">Nobody started a game in this window.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                  <th scope="col" className="num">
                    Of starters
                  </th>
                </tr>
              </thead>
              <tbody>
                {funnel.creating.map((row) => (
                  <tr key={row.step}>
                    <td>{STEP_LABELS[row.step] ?? row.step}</td>
                    <td className="num">{row.visits}</td>
                    {/*
                     * Measured against the first rung, not against all visits: the
                     * question is how many people who tried to make a game got one,
                     * and most visitors never try.
                     */}
                    <td className="num">{percent(row.visits, funnel.creating[0]?.visits ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="funnel-block">
          <h3>Landed on</h3>
          <table className="health-table">
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col" className="num">
                  Visits
                </th>
                <th scope="col" className="num">
                  Share
                </th>
                <th scope="col" className="num">
                  Plays
                </th>
              </tr>
            </thead>
            <RankedRows
              rows={funnel.entries.map((row) => ({ label: row.entry, visits: row.visits, plays: row.plays }))}
              whole={funnel.visits}
            />
          </table>
        </div>

        <div className="funnel-block">
          <h3>Came from</h3>
          <table className="health-table">
            <thead>
              <tr>
                <th scope="col">Referrer</th>
                <th scope="col" className="num">
                  Visits
                </th>
                <th scope="col" className="num">
                  Share
                </th>
                <th scope="col" className="num">
                  Plays
                </th>
              </tr>
            </thead>
            <RankedRows
              rows={funnel.referrers.map((row) => ({ label: row.referrer, visits: row.visits, plays: row.plays }))}
              whole={funnel.visits}
            />
          </table>
        </div>

        {campaignRows.length > 0 && (
          <div className="funnel-block">
            <h3>Campaigns</h3>
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">source / medium / campaign</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                  <th scope="col" className="num">
                    Share
                  </th>
                  <th scope="col" className="num">
                    Plays
                  </th>
                </tr>
              </thead>
              <RankedRows rows={campaignRows} whole={funnel.visits} />
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
