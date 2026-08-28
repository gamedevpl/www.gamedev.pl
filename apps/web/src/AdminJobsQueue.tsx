import { useCallback, useEffect, useState } from 'react';
import { AdminConfirmDialog } from './AdminConfirmDialog.js';
import { cancelConfirmCopy, publishConfirmCopy } from './adminJobConfirm.js';
import {
  cancelJob,
  deleteGame,
  fetchPublishedGames,
  publishJob,
  regateGame,
  retryJob,
  type CancelRefusal,
  type DeleteGameRefusal,
  type JobQueueEntry,
  type PublishedGame,
  type PublishRefusal,
  type RegateRefusal,
  type RetryRefusal,
} from './adminJobsApi.js';

const REFUSAL_COPY: Record<PublishRefusal, string> = {
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

function healthLabel(game: PublishedGame, now: number): string {
  const check = game.healthCheck;
  if (!check) return 'never checked';
  if (!check.verdictAt) {
    const minutes = Math.max(0, Math.floor((now - Date.parse(check.requestedAt)) / 60_000));
    return `checking… (${minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`} ago)`;
  }
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
            <button type="button" className="admin-job-publish" onClick={onRegate} disabled={busy !== null}>
              {busy === 'regate' ? 'Starting…' : 'Re-gate'}
            </button>
            <button
              type="button"
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

export function PublishedGames() {
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
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (state === 'forbidden' || state === 'loading') return null;
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

function duration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function JobRow({
  job,
  supersededCount,
  selected,
  onToggleSelect,
  onPreview,
  onPublished,
}: {
  job: JobQueueEntry;
  supersededCount?: number;
  selected: boolean;
  onToggleSelect: (jobId: number) => void;
  onPreview: (job: JobQueueEntry) => void;
  onPublished: () => void;
}) {
  const [busy, setBusy] = useState<'publish' | 'cancel' | 'retry' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'publish' | 'cancel' | null>(null);

  const publishable = job.state === 'ready_for_review';
  const previewable = publishable || Boolean(job.slug);

  const onPublish = useCallback(async () => {
    setBusy('publish');
    setMessage(null);
    try {
      const result = await publishJob(job.jobId);
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
      setConfirming(null);
    }
  }, [job.jobId, onPublished]);

  const onCancel = useCallback(async () => {
    setBusy('cancel');
    setMessage(null);
    try {
      const result = await cancelJob(job.jobId);
      if ('refused' in result) {
        setMessage(CANCEL_COPY[result.refused]);
      } else {
        setMessage(result.stopEnforced ? 'canceled and stopped' : 'canceled — session stops at next report');
        onPublished();
      }
    } catch {
      setMessage('could not reach the API');
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }, [job.jobId, onPublished]);

  const onRetry = useCallback(async () => {
    setBusy('retry');
    setMessage(null);
    setConfirming(null);
    try {
      const result = await retryJob(job.jobId);
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
  }, [job.jobId, onPublished]);

  const latest = job.recentTransitions[0];

  return (
    <tr className={job.stall ? 'admin-job-row is-stalled' : 'admin-job-row'}>
      <td className="admin-job-select-cell">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(job.jobId)}
          aria-label={`Select job #${job.jobId}`}
        />
      </td>
      <td>
        <div className="admin-job-title">{job.title}</div>
        <div className="admin-job-sub">
          #{job.jobId}
          {job.slug ? ` · ${job.slug}` : ''}
          {supersededCount && supersededCount > 0 ? (
            <span className="admin-job-superseded-badge">+{supersededCount} superseded</span>
          ) : null}
        </div>
      </td>
      <td>
        <span className={`admin-job-state-badge admin-job-state-badge--${job.state}`}>{job.state}</span>
        {job.stall ? <div className="admin-job-stall">{STALL_COPY[job.stall]}</div> : null}
        {latest?.reason ? <div className="admin-job-sub">{latest.reason}</div> : null}
      </td>
      <td>{duration(job.timeInStateMs)}</td>
      <td>{duration(job.ageMs)}</td>
      <td>
        <div className="admin-job-actions">
          {previewable ? (
            <button
              type="button"
              className="admin-job-preview-btn"
              onClick={() => onPreview(job)}
              title="Preview game in sandbox"
            >
              Preview
            </button>
          ) : null}
          {publishable ? (
            <button
              type="button"
              className="admin-job-publish"
              onClick={() => setConfirming('publish')}
              disabled={busy !== null}
            >
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </button>
          ) : null}
          {retryable(job) ? (
            <button type="button" className="admin-job-publish" onClick={onRetry} disabled={busy !== null}>
              {busy === 'retry' ? 'Retrying…' : 'Retry'}
            </button>
          ) : null}
          {job.state !== 'publishing' ? (
            <button
              type="button"
              className="admin-job-cancel"
              onClick={() => setConfirming('cancel')}
              disabled={busy !== null}
            >
              {busy === 'cancel' ? 'Canceling…' : 'Cancel'}
            </button>
          ) : null}
        </div>
        {message ? <div className="admin-job-message">{message}</div> : null}
        {confirming === 'publish' ? (
          <AdminConfirmDialog
            {...publishConfirmCopy([job])}
            busy={busy === 'publish'}
            busyLabel="Publishing…"
            onConfirm={() => void onPublish()}
            onDismiss={() => {
              if (busy === null) setConfirming(null);
            }}
          />
        ) : null}
        {confirming === 'cancel' ? (
          <AdminConfirmDialog
            {...cancelConfirmCopy([job])}
            danger
            busy={busy === 'cancel'}
            busyLabel="Canceling…"
            dismissLabel="Keep"
            onConfirm={() => void onCancel()}
            onDismiss={() => {
              if (busy === null) setConfirming(null);
            }}
          />
        ) : null}
      </td>
    </tr>
  );
}
