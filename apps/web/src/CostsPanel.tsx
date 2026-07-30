import { useEffect, useState } from 'react';
import { fetchCostReport, type CostReport, type JobCostSummary } from './adminApi.js';

/**
 * What building games costs, per job and per shipped game.
 *
 * The headline number is credits per published game, and it is deliberately computed
 * against *every* credit spent — including the ones spent on builds that never shipped.
 * A cost-per-game that quietly excluded failures would be the most flattering number
 * available and the least useful one: the failure rate is most of what a build costs.
 *
 * Money and tokens are shown as unmeasured rather than as zero. Copilot bills a premium
 * request per session and exposes no token counts, so credits are what there is; the
 * columns appear the moment a backend reports anything else.
 */

function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function JobRow({ job }: { job: JobCostSummary }) {
  return (
    <tr className={job.published ? 'admin-cost-row' : 'admin-cost-row is-unpublished'}>
      <td>
        <div className="admin-job-title">{job.title}</div>
        <div className="admin-job-sub">
          #{job.issueNumber}
          {job.slug ? ` · ${job.slug}` : ''}
        </div>
      </td>
      <td>
        <span className="admin-job-state">{job.state ?? '—'}</span>
      </td>
      <td>{job.sessions}</td>
      <td>{job.gateRuns}</td>
      <td>{duration(job.elapsedMs)}</td>
      <td>{job.tokens ? `${job.tokens.input + job.tokens.output}` : '—'}</td>
      <td>{job.usd === undefined ? '—' : `$${job.usd.toFixed(2)}`}</td>
    </tr>
  );
}

export function CostsPanel() {
  const [report, setReport] = useState<CostReport | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    fetchCostReport()
      .then((response) => {
        if (cancelled) return;
        if (response === null) {
          setState('forbidden');
          return;
        }
        setReport(response);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'forbidden') return <p className="health-empty">Not found.</p>;
  if (state === 'loading') return <p className="health-empty">Adding it up…</p>;
  if (state === 'error' || !report) return <p className="health-empty">Could not read the ledger.</p>;

  const { totals } = report;

  return (
    <section className="admin-costs">
      <h2 className="health-section-title">Cost</h2>

      <dl className="admin-cost-headline">
        <div>
          <dt>Credits per published game</dt>
          <dd>{report.creditsPerPublishedGame ?? '—'}</dd>
        </div>
        <div>
          <dt>Median time to publish</dt>
          <dd>{report.medianTimeToPublishMs === null ? '—' : duration(report.medianTimeToPublishMs)}</dd>
        </div>
        <div>
          <dt>Credits on builds that never shipped</dt>
          <dd>
            {report.creditsOnUnpublished}
            {totals.credits > 0 ? ` (${Math.round((report.creditsOnUnpublished / totals.credits) * 100)}%)` : ''}
          </dd>
        </div>
        <div>
          <dt>Spent in this window</dt>
          <dd>{totals.usd === undefined ? `${totals.credits} credits` : `$${totals.usd.toFixed(2)}`}</dd>
        </div>
      </dl>

      <p className="health-summary">
        {totals.jobs} job{totals.jobs === 1 ? '' : 's'} · {totals.sessions} agent session
        {totals.sessions === 1 ? '' : 's'} · {totals.gateRuns} gate run{totals.gateRuns === 1 ? '' : 's'} ·{' '}
        {totals.published} published
      </p>

      {report.unmeasuredJobs > 0 && (
        <p className="health-note">
          {report.unmeasuredJobs} job{report.unmeasuredJobs === 1 ? '' : 's'} in this window predate{' '}
          {report.unmeasuredJobs === 1 ? 's' : ''} the ledger and contribute nothing to these totals — the numbers are a
          floor, not a total.
        </p>
      )}

      {report.jobs.length === 0 ? (
        <p className="health-empty">Nothing has cost anything yet.</p>
      ) : (
        <div className="health-table-scroll">
          <table className="health-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>State</th>
                <th>Sessions</th>
                <th>Gate runs</th>
                <th>Elapsed</th>
                <th>Tokens</th>
                <th>Money</th>
              </tr>
            </thead>
            <tbody>
              {report.jobs.map((job) => (
                <JobRow key={job.issueNumber} job={job} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="health-note">
        One credit is one premium request — what an agent session costs, charged whether or not the session delivers
        anything. Tokens and money are dashes because the Copilot backend reports neither; both fill in on their own if
        a backend that does report them is ever wired up. Gate runs carry their Cloud Build id, so a line on the bill
        can be traced back to the game that caused it.
      </p>
    </section>
  );
}
