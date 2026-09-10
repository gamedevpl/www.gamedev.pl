import type { VisitFunnel } from './healthApi.js';

const BUILDER_LABELS: Record<string, string> = {
  platform: 'platform round',
  self: "creator's own agent",
  unknown: 'builder not recorded',
};

type Proposals = NonNullable<VisitFunnel['proposals']>;

function percent(part: number, whole: number): string {
  // No evidence renders as absence, never as a measured zero.
  if (whole === 0) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

function decided(row: { picked: number; postponed: number; muted: number }): number {
  return row.picked + row.postponed + row.muted;
}

export function ProposalFunnelBlock({ funnel }: { funnel: VisitFunnel }) {
  const proposals: Proposals | undefined = funnel.proposals;
  if (!proposals) return null;
  const rows = proposals.byBuilder.filter((row) => row.exposed > 0);

  return (
    <section className="health-block">
      <h4>Concept proposals</h4>
      <p className="health-summary">
        {proposals.exposed === 0
          ? 'No visit was shown a concept card in this window.'
          : `${proposals.exposed} visits saw a card; ${percent(decided(proposals), proposals.exposed)} decided, ${percent(proposals.picked, proposals.exposed)} picked an idea.`}
      </p>
      {rows.length > 0 ? (
        <table className="health-table">
          <thead>
            <tr>
              <th scope="col">Drawn by</th>
              <th scope="col" className="num">
                Shown
              </th>
              <th scope="col" className="num">
                Picked
              </th>
              <th scope="col" className="num">
                Not now
              </th>
              <th scope="col" className="num">
                Muted
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.builder}>
                <th scope="row">{BUILDER_LABELS[row.builder] ?? row.builder}</th>
                <td className="num">{row.exposed}</td>
                <td className="num">{percent(row.picked, row.exposed)}</td>
                <td className="num">{percent(row.postponed, row.exposed)}</td>
                <td className="num">{percent(row.muted, row.exposed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
