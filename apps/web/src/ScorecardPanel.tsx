import type { Scorecard, ScorecardsResponse } from './healthApi.js';

/**
 * What the nightly scorecard sweep last produced (docs/improvement-loop-plan.md IL-2).
 *
 * This panel exists because the sweep writes `games/{slug}/scorecard/current` for IL-3's
 * agents to read, and nothing else can see it. An aggregate whose first observable
 * symptom of being wrong is an agent acting on it is the same shape of risk as a
 * silently-dropping branch, so the output gets a window.
 *
 * It deliberately answers a **different question** from the game-health table below it.
 * That one recomputes from raw events every time it is opened, so it always looks
 * current — which means a sweep that quietly stopped running would be invisible there.
 * Here, staleness is the headline number.
 */

/** Hours after which the last sweep is old enough to be worth noticing. */
const STALE_AFTER_HOURS = 36;

function ageHours(iso: string, now: number): number {
  return (now - Date.parse(iso)) / 3_600_000;
}

function relativeAge(iso: string | null, now: number): string {
  if (!iso) return '—';
  const hours = ageHours(iso, now);
  if (!Number.isFinite(hours)) return '—';
  if (hours < 1) return 'under an hour ago';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** `—` for null, never `0%`: a game that reported no endings has not been measured. */
function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

export function ScorecardPanel({ data, now = Date.now() }: { data: ScorecardsResponse; now?: number }) {
  const { scorecards, newestComputedAt } = data;

  if (scorecards.length === 0) {
    return (
      <section className="funnel">
        <h2>Scorecards</h2>
        {/* The most likely cause by far, and the one an operator can act on. Naming it
            beats a bare "no data", which reads as "no games" rather than "no job". */}
        <p className="health-empty">
          The sweep has not written anything yet. If it was expected to run, check that the
          <code> scorecard-sweep </code> scheduler job exists and that
          <code> SCORECARD_SWEEP_AUDIENCE </code> is set on the service.
        </p>
      </section>
    );
  }

  const stale = newestComputedAt !== null && ageHours(newestComputedAt, now) > STALE_AFTER_HOURS;
  const truncated = scorecards.some((card) => card.window.truncated);

  return (
    <section className="funnel">
      <h2>Scorecards</h2>

      <ul className="funnel-stats">
        <li>
          <span className="funnel-stat-value">{scorecards.length}</span>
          <span className="funnel-stat-label">games scored</span>
        </li>
        <li>
          {/* The one number this panel exists for. Marked when old, because a nightly
              job that stopped is otherwise indistinguishable from one that ran.
              `health-badge--bad` is the page's existing error tone; inventing a new
              class here would render unstyled, and reusing an unrelated one would put a
              neutral value in an alarming colour. */}
          <span className="funnel-stat-value">{relativeAge(newestComputedAt, now)}</span>
          <span className="funnel-stat-label">
            last swept {stale && <span className="health-badge health-badge--bad">stale</span>}
          </span>
        </li>
      </ul>

      {stale && (
        <p className="health-note">
          The newest scorecard is over {STALE_AFTER_HOURS}h old, so the nightly sweep has likely stopped running.
        </p>
      )}
      {truncated && (
        <p className="health-note">
          A sweep hit its read cap, so counts in the affected scorecards are a floor rather than a total.
        </p>
      )}

      <div className="health-table-scroll">
        <table className="health-table">
          <thead>
            <tr>
              <th>Game</th>
              <th>Sessions</th>
              <th>Finish</th>
              <th>Win</th>
              <th>Votes</th>
              <th>Feedback</th>
              <th>Computed</th>
            </tr>
          </thead>
          <tbody>
            {scorecards.map((card: Scorecard) => (
              <tr key={card.slug}>
                <td className="health-slug">{card.slug}</td>
                <td>{card.sessions.count}</td>
                {/* finishRate and winRate are null when the game reported no endings —
                    rendered as `—` so "never says" is never shown as "nobody finishes". */}
                <td>{percent(card.depth.finishRate)}</td>
                <td>{percent(card.depth.winRate)}</td>
                <td>
                  {card.votes.up}↑ {card.votes.down}↓
                </td>
                <td>{card.feedback.count}</td>
                <td>{relativeAge(card.computedAt, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
