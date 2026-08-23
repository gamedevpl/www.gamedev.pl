import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminJobPreviewModal } from './AdminJobPreviewModal.js';
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

type FilterKind = 'ready' | 'stalled' | 'in_flight' | 'all';

function JobRow({
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
  onToggleSelect: (issueNumber: number) => void;
  onPreview: (job: JobQueueEntry) => void;
  onPublished: () => void;
}) {
  const [busy, setBusy] = useState<'publish' | 'cancel' | 'retry' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelArmed, setCancelArmed] = useState(false);

  const publishable = job.state === 'ready_for_review';
  const previewable = publishable || Boolean(job.slug);

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
        setMessage(result.stopEnforced ? 'canceled and stopped' : 'canceled — session stops at next report');
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
      <td className="admin-job-select-cell">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(job.issueNumber)}
          aria-label={`Select job #${job.issueNumber}`}
        />
      </td>
      <td>
        <div className="admin-job-title">{job.title}</div>
        <div className="admin-job-sub">
          #{job.issueNumber}
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
            <button type="button" className="admin-job-publish" onClick={onPublish} disabled={busy !== null}>
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
  const [filter, setFilter] = useState<FilterKind>('ready');
  const [search, setSearch] = useState('');
  const [latestOnly, setLatestOnly] = useState(true);
  const [groupByGame, setGroupByGame] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedIssues, setSelectedIssues] = useState<Set<number>>(new Set());
  const [previewTarget, setPreviewTarget] = useState<JobQueueEntry | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    running: boolean;
    current: number;
    total: number;
    success: number;
    failed: number;
  } | null>(null);

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
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const jobs = useMemo(() => queue?.jobs ?? [], [queue]);

  const gameGroups = useMemo(() => {
    const map = new Map<string, JobQueueEntry[]>();
    for (const j of jobs) {
      const key = j.slug || String(j.issueNumber);
      const list = map.get(key) ?? [];
      list.push(j);
      map.set(key, list);
    }
    return map;
  }, [jobs]);

  const counts = useMemo(() => {
    let readyGames = 0;
    let stalledCount = 0;
    let inFlightCount = 0;

    for (const list of gameGroups.values()) {
      if (list.some((j) => j.state === 'ready_for_review')) readyGames++;
      if (list.some((j) => j.stall !== null)) stalledCount++;
      if (
        list.some(
          (j) =>
            j.state === 'building' ||
            j.state === 'dispatched' ||
            j.state === 'queued' ||
            j.state === 'gating',
        )
      ) {
        inFlightCount++;
      }
    }

    return {
      ready: readyGames,
      stalled: stalledCount,
      in_flight: inFlightCount,
      all: jobs.length,
    };
  }, [gameGroups, jobs.length]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const results: Array<{ job: JobQueueEntry; supersededCount: number }> = [];

    for (const list of gameGroups.values()) {
      if (filter === 'ready') {
        const readyJobs = list.filter((j) => j.state === 'ready_for_review');
        if (readyJobs.length === 0) continue;
        if (latestOnly) {
          results.push({ job: readyJobs[0], supersededCount: list.length - 1 });
        } else {
          for (const j of readyJobs) results.push({ job: j, supersededCount: 0 });
        }
      } else if (filter === 'stalled') {
        const stalledJobs = list.filter((j) => j.stall !== null);
        if (stalledJobs.length === 0) continue;
        if (latestOnly) {
          results.push({ job: stalledJobs[0], supersededCount: list.length - 1 });
        } else {
          for (const j of stalledJobs) results.push({ job: j, supersededCount: 0 });
        }
      } else if (filter === 'in_flight') {
        const inFlight = list.filter(
          (j) =>
            j.state === 'building' ||
            j.state === 'dispatched' ||
            j.state === 'queued' ||
            j.state === 'gating',
        );
        if (inFlight.length === 0) continue;
        if (latestOnly) {
          results.push({ job: inFlight[0], supersededCount: list.length - 1 });
        } else {
          for (const j of inFlight) results.push({ job: j, supersededCount: 0 });
        }
      } else {
        // all
        if (latestOnly) {
          results.push({ job: list[0], supersededCount: list.length - 1 });
        } else {
          for (const j of list) results.push({ job: j, supersededCount: 0 });
        }
      }
    }

    return results.filter(({ job }) => {
      if (!term) return true;
      return (
        job.title.toLowerCase().includes(term) ||
        (job.slug && job.slug.toLowerCase().includes(term)) ||
        String(job.issueNumber).includes(term)
      );
    });
  }, [gameGroups, filter, latestOnly, search]);

  const groups = useMemo(() => {
    if (!groupByGame) return null;
    const map = new Map<string, JobQueueEntry[]>();
    for (const { job } of filteredItems) {
      const key = job.slug || job.title;
      const list = map.get(key) ?? [];
      list.push(job);
      map.set(key, list);
    }
    return [...map.entries()].map(([key, list]) => ({
      key,
      title: list[0].title,
      slug: list[0].slug,
      jobs: list,
      latest: list[0],
      readyCount: list.filter((j) => j.state === 'ready_for_review').length,
    }));
  }, [groupByGame, filteredItems]);

  const toggleSelect = useCallback((issueNumber: number) => {
    setSelectedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(issueNumber)) next.delete(issueNumber);
      else next.add(issueNumber);
      return next;
    });
  }, []);

  const allFilteredSelected = useMemo(() => {
    if (filteredItems.length === 0) return false;
    return filteredItems.every(({ job }) => selectedIssues.has(job.issueNumber));
  }, [filteredItems, selectedIssues]);

  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIssues((prev) => {
        const next = new Set(prev);
        for (const { job } of filteredItems) {
          next.delete(job.issueNumber);
        }
        return next;
      });
    } else {
      setSelectedIssues((prev) => {
        const next = new Set(prev);
        for (const { job } of filteredItems) {
          next.add(job.issueNumber);
        }
        return next;
      });
    }
  }, [allFilteredSelected, filteredItems]);

  const onBatchPublish = useCallback(
    async (targets: JobQueueEntry[]) => {
      const publishable = targets.filter((j) => j.state === 'ready_for_review');
      if (publishable.length === 0) return;
      setBatchProgress({ running: true, current: 0, total: publishable.length, success: 0, failed: 0 });

      let success = 0;
      let failed = 0;
      for (let i = 0; i < publishable.length; i++) {
        const item = publishable[i];
        setBatchProgress({ running: true, current: i + 1, total: publishable.length, success, failed });
        try {
          const res = await publishJob(item.issueNumber);
          if ('refused' in res) failed++;
          else success++;
        } catch {
          failed++;
        }
      }
      setBatchProgress({ running: false, current: publishable.length, total: publishable.length, success, failed });
      setSelectedIssues(new Set());
      void load();
    },
    [load],
  );

  const onBatchCancel = useCallback(
    async (targets: JobQueueEntry[]) => {
      const cancelable = targets.filter((j) => j.state !== 'publishing');
      if (cancelable.length === 0) return;
      setBatchProgress({ running: true, current: 0, total: cancelable.length, success: 0, failed: 0 });

      let success = 0;
      let failed = 0;
      for (let i = 0; i < cancelable.length; i++) {
        const item = cancelable[i];
        setBatchProgress({ running: true, current: i + 1, total: cancelable.length, success, failed });
        try {
          const res = await cancelJob(item.issueNumber);
          if ('refused' in res) failed++;
          else success++;
        } catch {
          failed++;
        }
      }
      setBatchProgress({ running: false, current: cancelable.length, total: cancelable.length, success, failed });
      setSelectedIssues(new Set());
      void load();
    },
    [load],
  );

  const selectedEntries = useMemo(
    () => jobs.filter((j) => selectedIssues.has(j.issueNumber)),
    [jobs, selectedIssues],
  );

  if (state === 'forbidden') return <p className="health-empty">Not found.</p>;
  if (state === 'loading') return <p className="health-empty">Reading the queue…</p>;
  if (state === 'error') return <p className="health-empty">Could not read the queue.</p>;

  const readyJobsToPublish = filteredItems
    .map(({ job }) => job)
    .filter((j) => j.state === 'ready_for_review');

  return (
    <section className="admin-jobs">
      <div className="admin-jobs-header-row">
        <div>
          <h2 className="health-section-title">Build queue</h2>
          <p className="health-summary">
            {counts.ready} {counts.ready === 1 ? 'game' : 'games'} ready to publish
            {counts.stalled > 0 ? ` · ${counts.stalled} stalled` : ''}
            {counts.in_flight > 0 ? ` · ${counts.in_flight} in flight` : ''}
          </p>
        </div>

        {readyJobsToPublish.length > 0 && (
          <button
            type="button"
            className="admin-bulk-publish-cta"
            onClick={() => void onBatchPublish(readyJobsToPublish)}
            disabled={batchProgress?.running}
          >
            ⚡ Publish all ready ({readyJobsToPublish.length})
          </button>
        )}
      </div>

      <div className="admin-jobs-toolbar">
        <div className="admin-jobs-filter-chips">
          {(['ready', 'stalled', 'in_flight', 'all'] as const).map((kind) => {
            const labels: Record<FilterKind, string> = {
              ready: 'Ready to publish',
              stalled: 'Stalled',
              in_flight: 'In flight',
              all: 'All history',
            };
            return (
              <button
                key={kind}
                type="button"
                className={`admin-filter-chip ${filter === kind ? 'is-active' : ''}`}
                onClick={() => setFilter(kind)}
              >
                {labels[kind]} <span className="admin-filter-chip-count">{counts[kind]}</span>
              </button>
            );
          })}
        </div>

        <div className="admin-jobs-toolbar-controls">
          <input
            type="search"
            className="admin-jobs-search-input"
            placeholder="Search by title, slug, #issue…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search jobs"
          />

          <label className="admin-jobs-group-toggle" title="Show only the latest valid version per game">
            <input
              type="checkbox"
              checked={latestOnly}
              onChange={(e) => setLatestOnly(e.target.checked)}
            />
            Latest only
          </label>

          <label className="admin-jobs-group-toggle">
            <input
              type="checkbox"
              checked={groupByGame}
              onChange={(e) => setGroupByGame(e.target.checked)}
            />
            Group by game
          </label>
        </div>
      </div>

      {batchProgress && (
        <div className={`admin-batch-progress ${batchProgress.running ? 'is-running' : 'is-done'}`}>
          <div className="admin-batch-progress-text">
            {batchProgress.running
              ? `Processing: ${batchProgress.current} / ${batchProgress.total}…`
              : `Batch completed: ${batchProgress.success} succeeded, ${batchProgress.failed} failed.`}
          </div>
          {!batchProgress.running && (
            <button
              type="button"
              className="admin-batch-dismiss"
              onClick={() => setBatchProgress(null)}
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {selectedIssues.size > 0 && (
        <div className="admin-jobs-bulk-bar">
          <span>{selectedIssues.size} selected</span>
          <div className="admin-jobs-bulk-actions">
            {selectedEntries.some((j) => j.state === 'ready_for_review') && (
              <button
                type="button"
                className="admin-job-publish"
                onClick={() => void onBatchPublish(selectedEntries)}
                disabled={batchProgress?.running}
              >
                Publish selected ({selectedEntries.filter((j) => j.state === 'ready_for_review').length})
              </button>
            )}
            <button
              type="button"
              className="admin-job-cancel"
              onClick={() => void onBatchCancel(selectedEntries)}
              disabled={batchProgress?.running}
            >
              Cancel selected ({selectedEntries.length})
            </button>
            <button
              type="button"
              className="admin-job-cancel"
              onClick={() => setSelectedIssues(new Set())}
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {filteredItems.length === 0 ? (
        <p className="health-empty">
          {jobs.length === 0 ? 'Nothing building.' : 'No jobs match the current filter/search.'}
        </p>
      ) : (
        <div className="health-table-scroll">
          <table className="health-table admin-jobs-table">
            <thead>
              <tr>
                <th className="admin-job-select-header">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all matching jobs"
                  />
                </th>
                <th>Game</th>
                <th>State</th>
                <th>In state</th>
                <th>Age</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {groupByGame && groups
                ? groups.map((grp) => {
                    const expanded = expandedGroups.has(grp.key);
                    return (
                      <tr key={grp.key} className="admin-job-group-row">
                        <td colSpan={6}>
                          <div className="admin-job-group-header">
                            <button
                              type="button"
                              className="admin-job-group-expand"
                              onClick={() => {
                                setExpandedGroups((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(grp.key)) next.delete(grp.key);
                                  else next.add(grp.key);
                                  return next;
                                });
                              }}
                            >
                              <span className="admin-job-group-chevron">{expanded ? '▼' : '▶'}</span>
                              <span className="admin-job-group-title">{grp.title}</span>
                              <span className="admin-job-group-badge">{grp.jobs.length} builds</span>
                              {grp.readyCount > 0 && (
                                <span className="admin-job-group-ready-badge">
                                  {grp.readyCount} ready to publish
                                </span>
                              )}
                            </button>
                            <div className="admin-job-group-actions">
                              {grp.readyCount > 0 && (
                                <button
                                  type="button"
                                  className="admin-job-publish"
                                  onClick={() => void onBatchPublish(grp.jobs)}
                                  disabled={batchProgress?.running}
                                >
                                  Publish ready ({grp.readyCount})
                                </button>
                              )}
                            </div>
                          </div>

                          {expanded && (
                            <table className="admin-job-nested-table">
                              <tbody>
                                {grp.jobs.map((j) => (
                                  <JobRow
                                    key={j.issueNumber}
                                    job={j}
                                    selected={selectedIssues.has(j.issueNumber)}
                                    onToggleSelect={toggleSelect}
                                    onPreview={(entry) => setPreviewTarget(entry)}
                                    onPublished={() => void load()}
                                  />
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    );
                  })
                : filteredItems.map(({ job, supersededCount }) => (
                    <JobRow
                      key={job.issueNumber}
                      job={job}
                      supersededCount={supersededCount}
                      selected={selectedIssues.has(job.issueNumber)}
                      onToggleSelect={toggleSelect}
                      onPreview={(entry) => setPreviewTarget(entry)}
                      onPublished={() => void load()}
                    />
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {previewTarget && (
        <AdminJobPreviewModal
          job={previewTarget}
          onClose={() => setPreviewTarget(null)}
          onPublished={() => {
            void load();
          }}
        />
      )}

      <PublishedGames />
    </section>
  );
}
