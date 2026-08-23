import { useCallback, useEffect, useState } from 'react';
import {
  cancelJob,
  deleteGame,
  fetchJobQueue,
  fetchPublishedGames,
  publishJob,
  regateGame,
  retryJob,
  type CancelRefusal,
  type DeleteGameRefusal,
  type JobQueueEntry,
  type JobQueueResponse,
  type PublishedGame,
  type PublishRefusal,
  type RegateRefusal,
  type RetryRefusal,
} from './adminJobsApi.js';

/**
 * The build queue an operator actually works from.
 *
 * Everything here was already answerable and unanswered: the queue endpoint has existed
 * with nothing rendering it, and publishing has been a curl command. The creator-
 * experience review's oldest finding is watching a build for three hours with no way to
 * tell a stuck agent from a slow one — this is the surface where that becomes visible,
 * and where the one thing an operator can do about a finished build is a button.
 *
 * Deliberately dense and unstyled-by-default: it is a working view for one person, not a
 * product surface, and a table that fits twenty jobs on a laptop beats cards that fit six.
 */

const REFUSAL_COPY: Record<PublishRefusal, string> = {
  // Each names the next step, because that is the difference between a refusal an
  // operator can act on and one that just says no.
  gate_red: 'the gate failed this version — read its report before publishing',
  not_gated: 'the gate has not run against this version yet',
  nothing_delivered: 'this build has never delivered a version',
  profile_required: 'the creator has not claimed a public profile — ask them to open Studio and use Claim handle',
  store_unavailable: 'the games store is not configured on this deployment',
  unknown: 'refused, and the reason was not one this console knows',
};

const STALL_COPY: Record<NonNullable<JobQueueEntry['stall']>, string> = {
  awaiting_input: 'waiting on the creator',
  not_dispatched: 'never picked up by an agent',
  quiet: 'agent silent',
  ended: 'agent ended the round',
  gate_not_started: 'delivered, gate never started',
  gate_crashed: 'gate build died with no verdict — ours',
  session_crashed: 'agent session errored on both checks — ours',
};

const CANCEL_COPY: Record<CancelRefusal, string> = {
  already_finished: 'already finished — the queue is behind, refresh',
  mid_publish: 'mid-publish — let the bake land or fail, then act on that',
  store_unavailable: 'the store is not configured on this deployment',
  unknown: 'refused, and the reason was not one this console knows',
};

const RETRY_COPY: Record<RetryRefusal, string> = {
  not_retryable: 'nothing to retry from this state',
  never_dispatched: 'never reached an agent, so there is nothing to resume — cancel it instead',
  dispatch_failed: 'the agent backend refused to start a session — check it, then try again',
  agent_backend_unavailable: 'no agent backend is configured on this deployment',
  store_unavailable: 'the store is not configured on this deployment',
  unknown: 'refused, and the reason was not one this console knows',
};

/** Where a retry makes sense: the round is dead, or alive and visibly stuck. */
function retryable(job: JobQueueEntry): boolean {
  if (job.state === 'failed' || job.state === 'needs_changes') return true;
  return (job.state === 'building' || job.state === 'dispatched') && job.stall !== null;
}

const REGATE_COPY: Record<RegateRefusal, string> = {
  not_published: 'not currently published — nothing live to check',
  version_missing: 'the published version is missing from the store',
  gate_unavailable: 'the gate is not configured on this deployment',
  store_unavailable: 'the store is not configured on this deployment',
  unknown: 'refused, and the reason was not one this console knows',
};

const DELETE_COPY: Record<DeleteGameRefusal, string> = {
  not_published: 'not currently published — already taken down',
  store_unavailable: 'the store is not configured on this deployment',
  unknown: 'refused, and the reason was not one this console knows',
};

/**
 * The health column in words. Three honest states: never asked, asked and waiting
 * (with the age, because a request the gate never picked up looks exactly like a slow
 * one until someone reads the date), and answered.
 */
function healthLabel(game: PublishedGame, now: number): string {
  const check = game.healthCheck;
  if (!check) return 'never checked';
  if (!check.verdictAt) {
    const minutes = Math.max(0, Math.floor((now - Date.parse(check.requestedAt)) / 60_000));
    return `checking… (${minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`} ago)`;
  }
  // Explicit on both branches: `green` is optional on the record, and a resolved check
  // that somehow lacks it must read as "unreadable", not as failing — the loud label
  // has to agree with the row highlight, which only fires on `green === false`.
  if (check.green === true) return `healthy (${check.verdictAt.slice(0, 10)})`;
  if (check.green === false) return `FAILING (${check.verdictAt.slice(0, 10)})`;
  return `verdict unreadable (${check.verdictAt.slice(0, 10)})`;
}

function PublishedRow({ game, onChanged }: { game: PublishedGame; onChanged: () => void }) {
  const [busy, setBusy] = useState<'regate' | 'delete' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);

  const onRegate = useCallback(async () => {
    setBusy('regate');
    setMessage(null);
    setDeleteArmed(false);
    try {
      const result = await regateGame(game.slug);
      if ('refused' in result) {
        setMessage(REGATE_COPY[result.refused]);
      } else {
        setMessage('health check started — the verdict lands within a few sweeps');
        onChanged();
      }
    } catch {
      setMessage('could not reach the API');
    } finally {
      setBusy(null);
    }
  }, [game.slug, onChanged]);

  const onDelete = useCallback(async () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setBusy('delete');
    setMessage(null);
    setDeleteArmed(false);
    try {
      const result = await deleteGame(game.slug);
      if ('refused' in result) {
        setMessage(DELETE_COPY[result.refused]);
      } else {
        setMessage('deleted — the game is offline');
        onChanged();
      }
    } catch {
      setMessage('could not reach the API');
    } finally {
      setBusy(null);
    }
  }, [deleteArmed, game.slug, onChanged]);

  const failing = game.healthCheck?.verdictAt && game.healthCheck.green === false;
  const published = game.state === 'published';

  return (
    <tr className={failing ? 'admin-job-row is-stalled' : 'admin-job-row'}>
      <td>
        <div className="admin-job-title">{game.slug}</div>
        <div className="admin-job-sub">{game.currentVersion}</div>
      </td>
      <td>{game.publishedAt.slice(0, 10)}</td>
      <td>
        <span className="admin-job-state">{published ? healthLabel(game, Date.now()) : game.state}</span>
        {failing ? <div className="admin-job-stall">creator nudged to refresh</div> : null}
      </td>
      <td>
        {published ? (
          <div className="admin-job-actions">
            <button className="admin-job-publish" onClick={onRegate} disabled={busy !== null}>
              {busy === 'regate' ? 'Starting…' : 'Re-gate'}
            </button>
            <button
              className={deleteArmed ? 'admin-job-cancel is-armed' : 'admin-job-cancel'}
              onClick={onDelete}
              disabled={busy !== null}
            >
              {busy === 'delete' ? 'Deleting…' : deleteArmed ? 'Sure? This is final' : 'Delete'}
            </button>
          </div>
        ) : null}
        {message ? <div className="admin-job-message">{message}</div> : null}
      </td>
    </tr>
  );
}

/**
 * What is live, and whether it still passes on today's engine.
 *
 * The queue above answers for builds in flight; published games are terminal jobs and
 * would never appear there — yet they are the only thing players actually see. This is
 * where the break-and-nudge loop starts: re-gate a game, and a red verdict nudges its
 * creator to run an improvement round. The game keeps serving either way — its baked
 * bundle froze the engine it shipped with.
 */
function PublishedGames() {
  const [games, setGames] = useState<PublishedGame[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');

  const load = useCallback(async () => {
    try {
      const response = await fetchPublishedGames();
      if (response === null) {
        setState('forbidden');
        return;
      }
      setGames(response);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
    // Half the queue's cadence: health verdicts arrive on the sweep's schedule, not in
    // seconds, and this table changes far less often than the queue above it.
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  // Forbidden renders nothing at all: the queue above has already said "Not found" to
  // a stranger, and a second copy would only say it twice.
  if (state === 'forbidden') return null;
  if (state === 'loading') return null;
  if (state === 'error') return <p className="health-empty">Could not read the published shelf.</p>;
  if (!games || games.length === 0) return null;

  return (
    <section className="admin-published">
      <h2 className="health-section-title">Published</h2>
      <div className="health-table-scroll">
        <table className="health-table">
          <thead>
            <tr>
              <th>Game</th>
              <th>Published</th>
              <th>Health</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <PublishedRow key={game.slug} game={game} onChanged={() => void load()} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Short, sortable duration: an operator reads "2h 5m", not 7_500_000. */
function duration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function JobRow({ job, onPublished }: { job: JobQueueEntry; onPublished: () => void }) {
  const [busy, setBusy] = useState<'publish' | 'cancel' | 'retry' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Cancel is irreversible — canceled has no exit in the state machine — so it takes two
  // clicks: the first arms, the second fires. Anything else on the row disarms it.
  const [cancelArmed, setCancelArmed] = useState(false);

  // Only a gate-green build can publish, and `ready_for_review` is precisely the state
  // that means so. Offering the button earlier would be offering an action the API will
  // refuse — the console should not invite a click it knows the answer to.
  const publishable = job.state === 'ready_for_review';

  const onPublish = useCallback(async () => {
    setBusy('publish');
    setMessage(null);
    setCancelArmed(false);
    try {
      const result = await publishJob(job.issueNumber);
      if ('refused' in result) {
        setMessage(REFUSAL_COPY[result.refused]);
      } else {
        setMessage(`published ${result.slug}`);
        onPublished();
      }
    } catch {
      setMessage('could not reach the API');
    } finally {
      setBusy(null);
    }
  }, [job.issueNumber, onPublished]);

  const onCancel = useCallback(async () => {
    if (!cancelArmed) {
      setCancelArmed(true);
      return;
    }
    setBusy('cancel');
    setMessage(null);
    setCancelArmed(false);
    try {
      const result = await cancelJob(job.issueNumber);
      if ('refused' in result) {
        setMessage(CANCEL_COPY[result.refused]);
      } else {
        // "Told to stop", not "stopped": the Copilot backend has no kill switch, so a
        // live session winds down when it next reads the channel. Saying more than
        // that would be promising something we cannot do.
        setMessage(result.stopEnforced ? 'canceled and stopped' : 'canceled — the session stops at its next report');
        onPublished();
      }
    } catch {
      setMessage('could not reach the API');
    } finally {
      setBusy(null);
    }
  }, [cancelArmed, job.issueNumber, onPublished]);

  const onRetry = useCallback(async () => {
    setBusy('retry');
    setMessage(null);
    setCancelArmed(false);
    try {
      const result = await retryJob(job.issueNumber);
      if ('refused' in result) {
        setMessage(RETRY_COPY[result.refused]);
      } else {
        setMessage(`new session started (${result.creditsSpent} credit${result.creditsSpent === 1 ? '' : 's'})`);
        onPublished();
      }
    } catch {
      setMessage('could not reach the API');
    } finally {
      setBusy(null);
    }
  }, [job.issueNumber, onPublished]);

  const latest = job.recentTransitions[0];

  return (
    <tr className={job.stall ? 'admin-job-row is-stalled' : 'admin-job-row'}>
      <td>
        <div className="admin-job-title">{job.title}</div>
        <div className="admin-job-sub">
          #{job.issueNumber}
          {job.slug ? ` · ${job.slug}` : ''}
        </div>
      </td>
      <td>
        <span className="admin-job-state">{job.state}</span>
        {job.stall ? <div className="admin-job-stall">{STALL_COPY[job.stall]}</div> : null}
        {/* The reason the job is where it is — `gate_red`, `task_failed`, `approved`.
            Without it the state alone cannot distinguish a build that failed from one
            that is merely waiting. */}
        {latest?.reason ? <div className="admin-job-sub">{latest.reason}</div> : null}
      </td>
      <td>{duration(job.timeInStateMs)}</td>
      <td>{duration(job.ageMs)}</td>
      <td>
        <div className="admin-job-actions">
          {publishable ? (
            <button className="admin-job-publish" onClick={onPublish} disabled={busy !== null}>
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </button>
          ) : null}
          {retryable(job) ? (
            // Offered where a round is dead or visibly stuck — not on every healthy
            // build, where the button would be an invitation to spend a credit on
            // nothing. One credit per click, and the copy says so afterwards.
            <button className="admin-job-publish" onClick={onRetry} disabled={busy !== null}>
              {busy === 'retry' ? 'Retrying…' : 'Retry'}
            </button>
          ) : null}
          {job.state !== 'publishing' ? (
            <button
              className={cancelArmed ? 'admin-job-cancel is-armed' : 'admin-job-cancel'}
              onClick={onCancel}
              disabled={busy !== null}
            >
              {busy === 'cancel' ? 'Canceling…' : cancelArmed ? 'Sure? This is final' : 'Cancel'}
            </button>
          ) : null}
        </div>
        {message ? <div className="admin-job-message">{message}</div> : null}
      </td>
    </tr>
  );
}

export function AdminJobsPanel() {
  const [queue, setQueue] = useState<JobQueueResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');

  const load = useCallback(async () => {
    try {
      const response = await fetchJobQueue();
      if (response === null) {
        setState('forbidden');
        return;
      }
      setQueue(response);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
    // A build queue is only useful while it is current, and an operator watching a job
    // move is the whole reason to have this open. Cheap: the endpoint reads the store
    // and costs no GitHub calls, which is why it can be polled at all.
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  if (state === 'forbidden') return <p className="health-empty">Not found.</p>;
  if (state === 'loading') return <p className="health-empty">Reading the queue…</p>;
  if (state === 'error') return <p className="health-empty">Could not read the queue.</p>;

  const jobs = queue?.jobs ?? [];

  return (
    <section className="admin-jobs">
      <h2 className="health-section-title">Build queue</h2>
      <p className="health-summary">
        {jobs.length} active {jobs.length === 1 ? 'job' : 'jobs'}
        {queue?.stalled ? ` · ${queue.stalled} stalled` : ''}
      </p>

      {jobs.length === 0 ? (
        <p className="health-empty">Nothing building.</p>
      ) : (
        <div className="health-table-scroll">
          <table className="health-table admin-jobs-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>State</th>
                <th>In state</th>
                <th>Age</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <JobRow key={job.issueNumber} job={job} onPublished={() => void load()} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PublishedGames />
    </section>
  );
}
