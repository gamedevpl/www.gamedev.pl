import type { VisitFunnel } from './healthApi.js';

// Operator-only, like the rest of this panel: hardcoded English, no i18n.

type Transfers = NonNullable<VisitFunnel['transfers']>;

function percent(part: number, whole: number): string {
  // Absence of evidence renders as absence, never as a confident zero.
  if (whole === 0) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

export function TransferFunnelBlock({ funnel }: { funnel: VisitFunnel }): JSX.Element | null {
  const transfers: Transfers | undefined = funnel.transfers;
  if (!transfers) return null;

  const quiet = transfers.sent === 0 && transfers.offered === 0;

  return (
    <section className="health-block">
      <h4>Game handovers</h4>
      {quiet ? (
        <p className="health-empty">Nobody handed a game over in this window.</p>
      ) : (
        <>
          <p className="health-summary">
            {transfers.sent} sent, {percent(transfers.cancelled, transfers.sent)} taken back; {transfers.offered} seen,{' '}
            {percent(transfers.answered, transfers.offered)} answered.
          </p>
          <table className="health-table">
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col" className="num">
                  Visits
                </th>
                <th scope="col" className="num">
                  Of its side
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>sent an invitation</td>
                <td className="num">{transfers.sent}</td>
                <td className="num">—</td>
              </tr>
              <tr>
                <td>took the invitation back</td>
                <td className="num">{transfers.cancelled}</td>
                <td className="num">{percent(transfers.cancelled, transfers.sent)}</td>
              </tr>
              <tr>
                <td>was shown an invitation</td>
                <td className="num">{transfers.offered}</td>
                <td className="num">—</td>
              </tr>
              <tr>
                <td>accepted it</td>
                <td className="num">{transfers.accepted}</td>
                <td className="num">{percent(transfers.accepted, transfers.offered)}</td>
              </tr>
              <tr>
                <td>declined it</td>
                <td className="num">{transfers.declined}</td>
                <td className="num">{percent(transfers.declined, transfers.offered)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
