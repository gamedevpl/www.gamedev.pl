import { useState } from 'react';
import { REVIEWER_COHORTS, type ReviewerCohort, type FramePerformanceGroup } from '@gamedevpl/contract';

type Report = {
  groups: FramePerformanceGroup[];
  truncated: boolean;
  measuredSessions: number;
  unmeasuredSessions: number;
};
const PAGE_SIZE = 10;

function gap(value: number | null, row: FramePerformanceGroup): string {
  return value === null ? (row.intervals.some((n) => n > 0) ? '>1000 ms' : '—') : `${value} ms`;
}

export function FramePerformancePanel({
  report,
  reviewers,
  onReviewersChange,
}: {
  report?: Report;
  reviewers?: ReviewerCohort;
  onReviewersChange?: (cohort: ReviewerCohort) => void;
}) {
  const [game, setGame] = useState('');
  const [page, setPage] = useState(0);
  if (!report) return null;
  const slugs = [...new Set(report.groups.map((row) => row.slug))].sort();
  const selectedGame = slugs.includes(game) ? game : '';
  const rows = report.groups.filter((row) => !selectedGame || row.slug === selectedGame);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  return (
    <section className="health-section">
      <h2>Frame performance by device</h2>
      <div className="operator-performance-controls">
        {onReviewersChange && (
          <label>
            Sessions
            <select
              aria-label="Performance sessions"
              value={reviewers}
              onChange={(e) => onReviewersChange(e.target.value as ReviewerCohort)}
            >
              {REVIEWER_COHORTS.map((value) => (
                <option key={value} value={value}>
                  {value === 'include' ? 'Players and reviewers' : value === 'only' ? 'Reviewers only' : 'Players only'}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Game
          <select
            aria-label="Game"
            value={selectedGame}
            onChange={(e) => {
              setGame(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All games</option>
            {slugs.map((slug) => (
              <option key={slug} value={slug}>
                {slug}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        Window total: {report.measuredSessions} measured sessions; {report.unmeasuredSessions} without a valid window.
      </p>
      <p className="operator-performance-note">
        Active agent windows and background, pause and resize transitions are excluded. Game health and engagement
        always exclude reviewer sessions. rAF FPS measures iframe animation cadence; rendered FPS uses the GameKit frame
        counter when available. Compare matching builds and devices; small samples are only a lead.
      </p>
      {report.truncated && <p role="status">Device groups were capped; these results are incomplete.</p>}
      {report.groups.length === 0 ? (
        <p>No frame performance samples yet.</p>
      ) : (
        <>
          <div className="operator-performance-pages" aria-label="Device group pages">
            <span>
              {rows.length} device groups · Page {currentPage + 1} of {pages}
            </span>
            <button
              type="button"
              className="health-window"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="health-window"
              disabled={currentPage === pages - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
          <div className="health-table-scroll">
            <table className="health-table operator-performance-table">
              <thead>
                <tr>
                  <th>Game / build</th>
                  <th>Device / cohort</th>
                  <th>rAF FPS</th>
                  <th>Rendered FPS</th>
                  <th>Sample</th>
                  <th>Frame gaps</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((row, index) => (
                  <tr key={`${selectedGame}:${currentPage}:${index}`}>
                    <td>
                      <a href={`/play/${row.slug}`}>{row.slug}</a>
                      <small title={row.artifactVersion ?? 'Unknown build'}>
                        {row.artifactVersion?.slice(0, 12) ?? 'unknown build'}
                      </small>
                    </td>
                    <td>
                      {row.device ? `${row.device.deviceClass} / ${row.device.system}` : 'unknown'}
                      <small>
                        {row.device ? `${row.device.browser} ${row.device.browserMajor ?? ''}` : 'unknown browser'}
                      </small>
                      <small>{row.reviewer ? 'Reviewer' : 'Player / legacy'}</small>
                    </td>
                    <td>{row.rafFps.toFixed(1)}</td>
                    <td>{row.renderedFps?.toFixed(1) ?? '—'}</td>
                    <td>
                      {row.sessions} session{row.sessions === 1 ? '' : 's'}
                      <small>
                        {row.windows} window{row.windows === 1 ? '' : 's'} · {Math.round(row.observedMs / 1000)} s
                      </small>
                    </td>
                    <td>
                      Max {Math.round(row.maxGapMs)} ms
                      <small>
                        &gt;100 ms: {row.gapsOver100Ms} · &gt;250 ms: {row.gapsOver250Ms}
                      </small>
                    </td>
                    <td>
                      <details>
                        <summary>Device details</summary>
                        <dl className="operator-performance-details">
                          <dt>Viewport / orientation</dt>
                          <dd>
                            {row.viewportWidth}×{row.viewportHeight} / {row.orientation}
                          </dd>
                          <dt>Canvas CSS / buffer</dt>
                          <dd>
                            {row.canvasCssWidth}×{row.canvasCssHeight} / {row.canvasWidth}×{row.canvasHeight}
                          </dd>
                          <dt>Render DPR / display DPR</dt>
                          <dd>
                            {row.dpr} / {row.device?.displayDpr ?? 'unknown'}
                          </dd>
                          <dt>Screen</dt>
                          <dd>
                            {row.device?.screenWidth
                              ? `${row.device.screenWidth}×${row.device.screenHeight ?? '?'}`
                              : 'unknown'}
                          </dd>
                          <dt>Reported CPU / RAM buckets</dt>
                          <dd>
                            {row.device?.cpuBucket ?? 'unknown'} /{' '}
                            {row.device?.memoryBucket ? `${row.device.memoryBucket} GiB` : 'unknown'}
                          </dd>
                          <dt>State / backend</dt>
                          <dd>
                            {row.state} / {row.gfxBackend ?? 'unknown'}
                          </dd>
                          <dt>p95 / p99 gap upper bound</dt>
                          <dd>
                            {gap(row.p95GapUpperMs, row)} / {gap(row.p99GapUpperMs, row)}
                          </dd>
                        </dl>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
