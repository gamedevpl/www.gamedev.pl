import type { VisitFunnel } from './healthApi.js';

const CLI_LABELS: Record<string, string> = {
  installed: 'installed the CLI',
  authorized: 'signed in',
  first_turn: 'first turn',
  build_requested: 'asked for a build',
  delivered: 'delivered',
  published: 'published',
  delegate_offered: 'was offered local delegation',
  delegate_used: 'used a local adapter',
  verify_failed: 'failed the static ladder',
};

function percent(part: number, whole: number): string {
  if (whole === 0) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

export function CliFunnelBlock({ funnel }: { funnel: VisitFunnel }) {
  const rows = funnel.cli ?? [];
  return (
    <div className="funnel-block" data-testid="cli-funnel">
      <h3>gamedev CLI</h3>
      {rows.every((row) => row.visits === 0) ? (
        <p className="health-empty">
          Nobody used the gamedev CLI in this window. Pilot verdict needs a live cohort — do not invent one.
        </p>
      ) : (
        <table className="health-table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col" className="num">
                Visits
              </th>
              <th scope="col" className="num">
                Of installed
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.step}>
                <td>{CLI_LABELS[row.step] ?? row.step}</td>
                <td className="num">{row.visits}</td>
                <td className="num">{percent(row.visits, rows[0]?.visits ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
