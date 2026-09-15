import { useEffect, useState } from 'react';
import './admin-jobs-queue.css';
import './admin-small-panels.css';
import { fetchCostReport, type CostReport, type JobCostSummary, type JobSessionSummary } from './adminApi.js';

/**
 * What building games costs, per job and per shipped game.
 *
 * The headline number is what one published game costs, and it is deliberately computed
 * against *every* credit spent — including the ones spent on builds that never shipped.
 * A cost-per-game that quietly excluded failures would be the most flattering number
 * available and the least useful one: the failure rate is most of what a build costs.
 *
 * Money is converted, not estimated: credits and tokens both have published rates. What
 * has no rate is named in the footnote rather than guessed, so a figure here can be a
 * floor, and a `≤` marks the one that is a bound instead.
 */

function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** Always two decimals: these are cents-scale figures, and `$0.1` reads as a typo. */
function money(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

// Minute precision, UTC: a session log compares runs, not local clocks.
function timestamp(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

function JobRow({ job }: { job: JobCostSummary }) {
  return (
    <tr className={job.published ? 'admin-cost-row' : 'admin-cost-row is-unpublished'}>
      <td>
        <div className="admin-job-title">{job.title}</div>
        <div className="admin-job-sub">
          #{job.jobId}
          {job.slug ? ` · ${job.slug}` : ''}
        </div>
      </td>
      <td>
        <span className="admin-job-state">{job.state ?? '—'}</span>
      </td>
      <td>{job.sessions}</td>
      <td>{job.gateRuns}</td>
      <td>{job.conceptCalls}</td>
      <td>{duration(job.elapsedMs)}</td>
      <td>{job.tokens ? `${job.tokens.input + job.tokens.output}` : '—'}</td>
      <td title={job.usdBounded ? 'Upper bound: cache reads are folded into this session’s input count' : undefined}>
        {job.usd === undefined ? '—' : `${job.usdBounded ? '≤' : ''}${money(job.usd)}`}
      </td>
    </tr>
  );
}

function SessionRow({ session }: { session: JobSessionSummary }) {
  return (
    <tr className="admin-cost-row">
      <td>
        <div className="admin-job-title">{session.title}</div>
        <div className="admin-job-sub">#{session.jobId}</div>
      </td>
      <td>
        {session.backend}
        {session.model ? ` · ${session.model}` : ''}
      </td>
      <td>{timestamp(session.startedAt)}</td>
      <td>{session.durationMs === undefined ? '—' : duration(session.durationMs)}</td>
      <td>{session.state ?? '—'}</td>
      <td
        title={session.usdBounded ? 'Upper bound: cache reads are folded into this session’s input count' : undefined}
      >
        {session.usd === undefined ? '—' : `${session.usdBounded ? '≤' : ''}${money(session.usd)}`}
      </td>
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
          <dt>Cost per published game</dt>
          <dd>{report.usdPerPublishedGame === null ? '—' : money(report.usdPerPublishedGame)}</dd>
          {/* The credit figure stays visible beside the money: it is the unit the bill
              arrives in, so it is the one to check a bill against. */}
          <dd className="admin-cost-sub">
            {report.creditsPerPublishedGame === null
              ? 'nothing published yet'
              : `${report.creditsPerPublishedGame} credits`}
          </dd>
        </div>
        <div>
          <dt>Median time to publish</dt>
          <dd>{report.medianTimeToPublishMs === null ? '—' : duration(report.medianTimeToPublishMs)}</dd>
        </div>
        <div>
          <dt>Spent on builds that never shipped</dt>
          <dd>{money(report.usdOnUnpublished)}</dd>
          <dd className="admin-cost-sub">
            {totals.credits > 0
              ? `${Math.round((report.creditsOnUnpublished / totals.credits) * 100)}% of the window`
              : 'nothing spent yet'}
          </dd>
        </div>
        <div>
          <dt>Spent in this window</dt>
          {/* A dash, not $0.00: an absent total means nothing in the window was priced,
              which is not the same claim as "the window cost nothing". The rows below
              use the same rule, and a headline that disagreed with them would be the
              one number a reader trusts least. */}
          <dd>{totals.usd === undefined ? '—' : money(totals.usd)}</dd>
          <dd className="admin-cost-sub">{totals.credits} credits</dd>
        </div>
      </dl>

      <p className="health-summary">
        {totals.jobs} job{totals.jobs === 1 ? '' : 's'} · {totals.sessions} agent session
        {totals.sessions === 1 ? '' : 's'} · {totals.gateRuns} gate run{totals.gateRuns === 1 ? '' : 's'} ·{' '}
        {totals.conceptCalls} concept call
        {totals.conceptCalls === 1 ? '' : 's'} · {totals.published} published
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
                <th>Concept calls</th>
                <th>Elapsed</th>
                <th>Tokens</th>
                <th>Money</th>
              </tr>
            </thead>
            <tbody>
              {report.jobs.map((job) => (
                <JobRow key={job.jobId} job={job} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="health-section-title">Sessions</h2>

      {report.sessions.length === 0 ? (
        <p className="health-empty">No agent session has been dispatched yet.</p>
      ) : (
        <>
          <div className="health-table-scroll">
            <table className="health-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Backend</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>State</th>
                  <th>Money</th>
                </tr>
              </thead>
              <tbody>
                {report.sessions.map((session) => (
                  <SessionRow key={`${session.jobId}-${session.ref}`} session={session} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="health-note">
            Newest {report.sessions.length} session{report.sessions.length === 1 ? '' : 's'}; older ones still count in
            the totals above. A dash under Duration means still running, or an earlier session in the same job that a
            resume superseded — the backend stops watching a superseded session, so it never learns how that one ended.
          </p>
        </>
      )}

      {report.unpricedModels.length > 0 && (
        <p className="health-note">
          Counted, not priced: <strong>{report.unpricedModels.join(', ')}</strong> billed tokens in this window with no
          published rate in the price table, so none of that spending is in the figures above. Until a rate lands for
          {report.unpricedModels.length === 1 ? ' it' : ' them'}, treat every number on this page as a floor.
        </p>
      )}

      <p className="health-note">
        One credit is one premium request — what an agent session costs, charged whether or not the session delivers
        anything — and GitHub prices a credit at a flat $0.01, while token spending is converted at the billing
        model&rsquo;s published per-million rate (price table {report.priceTableVersion}). Neither is estimated. What is
        still missing: the gate&rsquo;s Cloud Build minutes, which nothing reports back yet; the concept calls a
        proposal makes, counted here but not priced because the client drops the usage envelope those calls return; and
        any model listed above as unpriced. All of them would only push these figures up. Gate runs carry their Cloud
        Build id, so a line on the bill can be traced back to the game that caused it.
      </p>
    </section>
  );
}
