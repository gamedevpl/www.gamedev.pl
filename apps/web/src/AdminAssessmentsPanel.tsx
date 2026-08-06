import { useEffect, useState } from 'react';
import { fetchAdminAssessments, type AdminAssessmentsResponse } from './reviewApi.js';

/**
 * Operator view of reviewer assessments (docs/game-assessment-plan.md).
 * Deliberately untranslated, like the rest of the operator console.
 */

export function AdminAssessmentsPanel() {
  const [data, setData] = useState<AdminAssessmentsResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchAdminAssessments()
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="health-empty">Could not read assessments.</p>;
  if (!data) return <p className="health-empty">Loading assessments…</p>;
  if (data.total === 0) {
    return (
      <p className="health-empty">
        No assessments yet. Point a colleague at <code>/review</code> after adding their uid to{' '}
        <code>REVIEWER_UIDS</code>.
      </p>
    );
  }

  return (
    <div className="admin-assessments">
      <p className="admin-assessments-summary">
        {data.total} assessment{data.total === 1 ? '' : 's'} across {data.games.length} game
        {data.games.length === 1 ? '' : 's'}.
      </p>

      <table className="admin-assessments-table">
        <thead>
          <tr>
            <th scope="col">Game</th>
            <th scope="col">Keep</th>
            <th scope="col">Cut</th>
            <th scope="col">Skip</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {data.games.map((game) => (
            <tr key={game.slug}>
              <td>
                <strong>{game.title}</strong>
                <div className="admin-assessments-slug">{game.slug}</div>
              </td>
              <td>{game.keep}</td>
              <td className={game.cut > 0 ? 'is-warn' : undefined}>{game.cut}</td>
              <td>{game.skip}</td>
              <td>{game.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="admin-assessments-recent-title">Recent</h3>
      <ul className="admin-assessments-recent">
        {data.recent.map((row) => (
          <li key={row.id}>
            <span className={`admin-verdict is-${row.verdict}`}>{row.verdict}</span> <strong>{row.title}</strong>
            <span className="admin-assessments-slug"> {row.slug}</span>
            {row.note ? <p className="admin-assessments-note">{row.note}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
