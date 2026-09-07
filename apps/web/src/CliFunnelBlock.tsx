import type { CliStep } from '@gamedevpl/contract';
import type { VisitFunnel } from './healthApi.js';

const CLI_LABELS: Record<CliStep, string> & Record<string, string> = {
  installed: 'installed the CLI',
  authorized: 'signed in',
  first_turn: 'first turn',
  build_requested: 'asked for a build',
  delivered: 'delivered',
  published: 'published',
  kit_update_available: 'kit update available',
  kit_update_started: 'started kit update',
  kit_update_completed: 'updated kit',
  kit_update_failed: 'kit update failed',
  play_requested: 'asked to play',
  delegate_offered: 'was offered local delegation',
  delegate_used: 'used a local adapter',
  verify_failed: 'failed the static ladder',
};

const CHANNEL_LABELS: Record<string, string> = {
  curl: 'curl | sh',
  ps1: 'PowerShell',
  update: 'gamedevpl update',
  unknown: 'unknown channel',
};

const OS_LABELS: Record<string, string> = {
  linux: 'Linux',
  darwin: 'macOS',
  win32: 'Windows',
  unknown: 'unknown OS',
};

const STAGE_LABELS: Record<string, string> = {
  typecheck: 'typecheck',
  check_static: 'check:static',
  check_game: 'check:game',
  unknown: 'unknown stage',
};

function percent(part: number, whole: number): string {
  if (whole === 0) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

type Pilot = NonNullable<VisitFunnel['cliPilot']>;

// The number Wave F waits on, said rather than inferred.
function verdictLine(pilot: Pilot): string {
  if (pilot.published > 0) {
    return `${plural(pilot.published, 'session', 'sessions')} of ${pilot.sessions} watched a game publish; ${pilot.delivered} delivered sources.`;
  }
  if (pilot.delivered > 0) {
    return `Nobody has published this way yet. ${plural(pilot.delivered, 'session', 'sessions')} of ${pilot.sessions} delivered sources — the gate and the operator are the rest of that path.`;
  }
  return `No session has delivered sources yet, so nothing has finished this way. ${plural(pilot.sessions, 'session', 'sessions')} in the window.`;
}

function DimensionRows({ title, rows }: { title: string; rows: Array<{ label: string; sessions: number }> }) {
  const used = rows.filter((row) => row.sessions > 0);
  if (used.length === 0) return null;
  return (
    <p className="health-summary">
      {title}: {used.map((row) => `${row.label} ${row.sessions}`).join(' · ')}
    </p>
  );
}

function AdapterTable({ pilot }: { pilot: Pilot }) {
  const rows = pilot.adapters.filter((row) => row.offered + row.used > 0);
  if (rows.length === 0) return null;
  return (
    <table className="health-table">
      <thead>
        <tr>
          <th scope="col">Local agent</th>
          <th scope="col" className="num">
            Offered
          </th>
          <th scope="col" className="num">
            Ran
          </th>
          <th scope="col" className="num">
            Taken up
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.adapter}>
            <td>{row.adapter}</td>
            <td className="num">{row.offered}</td>
            <td className="num">{row.used}</td>
            <td className="num">{percent(row.used, row.offered)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CliFunnelBlock({ funnel }: { funnel: VisitFunnel }) {
  if (!funnel.cli) return null;
  const rows = funnel.cli;
  const pilot = funnel.cliPilot;
  const sessions = pilot?.sessions ?? rows[0]?.visits ?? 0;
  return (
    <div className="funnel-block" data-testid="cli-funnel">
      <h3>gamedevpl CLI</h3>
      {rows.every((row) => row.visits === 0) ? (
        <p className="health-empty">
          Nobody used the gamedevpl CLI in this window. Pilot verdict needs a live cohort — do not invent one.
        </p>
      ) : (
        <>
          {pilot ? (
            <>
              <p className="health-summary">
                <strong>Does anyone finish a game this way?</strong> {verdictLine(pilot)}
              </p>
              <p className="health-note">
                Every gamedevpl run is its own session, so these are session counts, not one creator followed from
                install to publish.
              </p>
            </>
          ) : null}
          <table className="health-table">
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col" className="num">
                  Sessions
                </th>
                <th scope="col" className="num">
                  Of sessions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.step}>
                  <td>{CLI_LABELS[row.step] ?? row.step}</td>
                  <td className="num">{row.visits}</td>
                  <td className="num">{percent(row.visits, sessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pilot ? (
            <>
              <AdapterTable pilot={pilot} />
              <DimensionRows
                title="Ladder broke at"
                rows={pilot.verifyFailures.map((row) => ({
                  label: STAGE_LABELS[row.stage] ?? row.stage,
                  sessions: row.sessions,
                }))}
              />
              <DimensionRows
                title="Arrived by"
                rows={pilot.installs.map((row) => ({
                  label: CHANNEL_LABELS[row.channel] ?? row.channel,
                  sessions: row.sessions,
                }))}
              />
              <DimensionRows
                title="Ran on"
                rows={pilot.platforms.map((row) => ({
                  label: OS_LABELS[row.os] ?? row.os,
                  sessions: row.sessions,
                }))}
              />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
