import { useCallback, useEffect, useMemo, useState } from 'react';
import './admin-jobs-queue.css';
import { AdminConfirmDialog } from './AdminConfirmDialog.js';
import { AdminJobPreviewModal } from './AdminJobPreviewModal.js';
import { JobRow, PublishedGames } from './AdminJobsQueue.js';
import { cancelConfirmCopy, publishConfirmCopy } from './adminJobConfirm.js';
import { cancelJob, fetchJobQueue, publishJob, type JobQueueEntry, type JobQueueResponse } from './adminJobsApi.js';

type FilterKind = 'ready' | 'stalled' | 'in_flight' | 'all';

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
  const [pendingBatch, setPendingBatch] = useState<{
    kind: 'publish' | 'cancel';
    targets: JobQueueEntry[];
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
      const key = j.slug || String(j.jobId);
      const list = map.get(key) ?? [];
      list.push(j);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.jobId - a.jobId);
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
      if (list.some((j) => j.state === 'building' || j.state === 'dispatched' || j.state === 'queued')) {
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
        const inFlight = list.filter((j) => j.state === 'building' || j.state === 'dispatched' || j.state === 'queued');
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
        String(job.jobId).includes(term)
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

  const toggleSelect = useCallback((jobId: number) => {
    setSelectedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

  const allFilteredSelected = useMemo(() => {
    if (filteredItems.length === 0) return false;
    return filteredItems.every(({ job }) => selectedIssues.has(job.jobId));
  }, [filteredItems, selectedIssues]);

  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIssues((prev) => {
        const next = new Set(prev);
        for (const { job } of filteredItems) {
          next.delete(job.jobId);
        }
        return next;
      });
    } else {
      setSelectedIssues((prev) => {
        const next = new Set(prev);
        for (const { job } of filteredItems) {
          next.add(job.jobId);
        }
        return next;
      });
    }
  }, [allFilteredSelected, filteredItems]);

  const onBatchPublish = useCallback(
    async (targets: JobQueueEntry[]) => {
      const publishable = targets.filter((j) => j.state === 'ready_for_review');
      if (publishable.length === 0) return;
      setPendingBatch(null);
      setBatchProgress({ running: true, current: 0, total: publishable.length, success: 0, failed: 0 });

      let success = 0;
      let failed = 0;
      for (let i = 0; i < publishable.length; i++) {
        const item = publishable[i];
        setBatchProgress({ running: true, current: i + 1, total: publishable.length, success, failed });
        try {
          const res = await publishJob(item.jobId);
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
      setPendingBatch(null);
      setBatchProgress({ running: true, current: 0, total: cancelable.length, success: 0, failed: 0 });

      let success = 0;
      let failed = 0;
      for (let i = 0; i < cancelable.length; i++) {
        const item = cancelable[i];
        setBatchProgress({ running: true, current: i + 1, total: cancelable.length, success, failed });
        try {
          const res = await cancelJob(item.jobId);
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

  const selectedEntries = useMemo(() => jobs.filter((j) => selectedIssues.has(j.jobId)), [jobs, selectedIssues]);

  if (state === 'forbidden') return <p className="health-empty">Not found.</p>;
  if (state === 'loading') return <p className="health-empty">Reading the queue…</p>;
  if (state === 'error') return <p className="health-empty">Could not read the queue.</p>;

  const readyJobsToPublish = filteredItems.map(({ job }) => job).filter((j) => j.state === 'ready_for_review');

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
            onClick={() => setPendingBatch({ kind: 'publish', targets: readyJobsToPublish })}
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
            <input type="checkbox" checked={latestOnly} onChange={(e) => setLatestOnly(e.target.checked)} />
            Latest only
          </label>

          <label className="admin-jobs-group-toggle">
            <input type="checkbox" checked={groupByGame} onChange={(e) => setGroupByGame(e.target.checked)} />
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
            <button type="button" className="admin-batch-dismiss" onClick={() => setBatchProgress(null)}>
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
                onClick={() =>
                  setPendingBatch({
                    kind: 'publish',
                    targets: selectedEntries.filter((j) => j.state === 'ready_for_review'),
                  })
                }
                disabled={batchProgress?.running}
              >
                Publish selected ({selectedEntries.filter((j) => j.state === 'ready_for_review').length})
              </button>
            )}
            <button
              type="button"
              className="admin-job-cancel"
              onClick={() =>
                setPendingBatch({
                  kind: 'cancel',
                  targets: selectedEntries.filter((j) => j.state !== 'publishing'),
                })
              }
              disabled={batchProgress?.running}
            >
              Cancel selected ({selectedEntries.length})
            </button>
            <button type="button" className="admin-job-cancel" onClick={() => setSelectedIssues(new Set())}>
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
                                <span className="admin-job-group-ready-badge">{grp.readyCount} ready to publish</span>
                              )}
                            </button>
                            <div className="admin-job-group-actions">
                              {grp.readyCount > 0 && (
                                <button
                                  type="button"
                                  className="admin-job-publish"
                                  onClick={() =>
                                    setPendingBatch({
                                      kind: 'publish',
                                      targets: grp.jobs.filter((j) => j.state === 'ready_for_review'),
                                    })
                                  }
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
                                    key={j.jobId}
                                    job={j}
                                    selected={selectedIssues.has(j.jobId)}
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
                      key={job.jobId}
                      job={job}
                      supersededCount={supersededCount}
                      selected={selectedIssues.has(job.jobId)}
                      onToggleSelect={toggleSelect}
                      onPreview={(entry) => setPreviewTarget(entry)}
                      onPublished={() => void load()}
                    />
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingBatch && pendingBatch.targets.length > 0 ? (
        pendingBatch.kind === 'publish' ? (
          <AdminConfirmDialog
            {...publishConfirmCopy(pendingBatch.targets)}
            busy={Boolean(batchProgress?.running)}
            busyLabel="Publishing…"
            onConfirm={() => void onBatchPublish(pendingBatch.targets)}
            onDismiss={() => {
              if (!batchProgress?.running) setPendingBatch(null);
            }}
          />
        ) : (
          <AdminConfirmDialog
            {...cancelConfirmCopy(pendingBatch.targets)}
            danger
            busy={Boolean(batchProgress?.running)}
            busyLabel="Canceling…"
            dismissLabel="Keep"
            onConfirm={() => void onBatchCancel(pendingBatch.targets)}
            onDismiss={() => {
              if (!batchProgress?.running) setPendingBatch(null);
            }}
          />
        )
      ) : null}

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
