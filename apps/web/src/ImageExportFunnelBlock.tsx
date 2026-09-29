import type { VisitFunnel } from './healthApi.js';

// Operator-only, like the rest of this panel: hardcoded English, no i18n.

function percent(part: number, whole: number): string {
  if (whole === 0) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

export function ImageExportFunnelBlock({ funnel }: { funnel: VisitFunnel }): JSX.Element | null {
  const read = funnel.imageExport;
  if (!read) return null;
  const rows: Array<[string, number, string]> = [
    ['was asked to save a photo', read.requested, '—'],
    ['saved it', read.saved, percent(read.saved, read.requested)],
    ['said not now or let it lapse', read.dismissed, percent(read.dismissed, read.requested)],
    ['tried to save, but the download failed', read.failed ?? 0, percent(read.failed ?? 0, read.requested)],
    ['had a request refused by the shell', read.rejected, '—'],
  ];

  return (
    <section className="health-block">
      <h4>Game photos</h4>
      {read.requested === 0 && read.rejected === 0 ? (
        <p className="health-empty">No game asked to save a photo in this window.</p>
      ) : (
        <table className="health-table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col" className="num">
                Visits
              </th>
              <th scope="col" className="num">
                Of asked
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, visits, share]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="num">{visits}</td>
                <td className="num">{share}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
