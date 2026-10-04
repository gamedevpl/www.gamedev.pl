import { REVIEWER_COHORTS, type ReviewerCohort, type FramePerformanceGroup } from '@gamedevpl/contract';

type Report = {
  groups: FramePerformanceGroup[];
  truncated: boolean;
  measuredSessions: number;
  unmeasuredSessions: number;
};

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
  if (!report) return null;
  return (
    <section className="health-section">
      <h2>Frame performance by device</h2>
      {onReviewersChange && (
        <label>
          Performance sessions:{' '}
          <select value={reviewers} onChange={(e) => onReviewersChange(e.target.value as ReviewerCohort)}>
            {REVIEWER_COHORTS.map((value) => (
              <option key={value} value={value}>
                {value === 'include' ? 'Players and reviewers' : value === 'only' ? 'Reviewers only' : 'Players only'}
              </option>
            ))}
          </select>
        </label>
      )}
      <p>Active agent windows are excluded. Game health and engagement below always exclude reviewer sessions.</p>
      <p>
        {report.measuredSessions} measured sessions; {report.unmeasuredSessions} without a valid window. Background,
        pause and resize transitions are excluded. FPS measures iframe animation cadence; rendered FPS uses the GameKit
        frame counter when available.
      </p>
      {report.truncated && <p>Device groups were capped; these results are incomplete.</p>}
      {report.groups.length === 0 ? (
        <p>No frame performance samples yet.</p>
      ) : (
        <div className="health-table-scroll">
          <table className="health-table">
            <thead>
              <tr>
                <th>Game / build</th>
                <th>Session cohort</th>
                <th>Device / browser</th>
                <th>Viewport</th>
                <th>Canvas CSS / buffer</th>
                <th>DPR</th>
                <th>State / backend</th>
                <th>Sessions / windows</th>
                <th>Observed</th>
                <th>rAF FPS</th>
                <th>Rendered FPS</th>
                <th>p95 / p99 gap upper bound</th>
                <th>Max gap</th>
                <th>Gaps &gt;100 / &gt;250 ms</th>
              </tr>
            </thead>
            <tbody>
              {report.groups.map((row, index) => (
                <tr key={index}>
                  <td>
                    <a href={`/play/${row.slug}`}>{row.slug}</a>
                    <br />
                    <span title={row.artifactVersion ?? 'Unknown build'}>
                      {row.artifactVersion?.slice(0, 12) ?? 'unknown build'}
                    </span>
                  </td>
                  <td>{row.reviewer ? 'Reviewer' : 'Player / legacy'}</td>
                  <td>
                    {row.device
                      ? `${row.device.deviceClass} / ${row.device.system} / ${row.device.browser} ${row.device.browserMajor ?? ''}`
                      : 'unknown'}
                    <br />
                    {row.device?.screenWidth
                      ? `Screen: ${row.device.screenWidth}×${row.device.screenHeight ?? '?'} / display DPR: ${row.device.displayDpr ?? '?'}`
                      : ''}
                    <br />
                    {row.device?.cpuBucket ? `Reported CPU bucket: ${row.device.cpuBucket}` : ''}
                    {row.device?.memoryBucket ? ` / reported RAM bucket: ${row.device.memoryBucket} GiB` : ''}
                  </td>
                  <td>
                    {row.viewportWidth}×{row.viewportHeight}
                    <br />
                    {row.orientation}
                  </td>
                  <td>
                    {row.canvasCssWidth}×{row.canvasCssHeight} / {row.canvasWidth}×{row.canvasHeight}
                  </td>
                  <td>{row.dpr}</td>
                  <td>
                    {row.state} / {row.gfxBackend ?? 'unknown'}
                  </td>
                  <td>
                    {row.sessions} / {row.windows}
                  </td>
                  <td>{Math.round(row.observedMs / 1000)} s</td>
                  <td>{row.rafFps.toFixed(1)}</td>
                  <td>{row.renderedFps?.toFixed(1) ?? '—'}</td>
                  <td>
                    {gap(row.p95GapUpperMs, row)} / {gap(row.p99GapUpperMs, row)}
                  </td>
                  <td>{Math.round(row.maxGapMs)} ms</td>
                  <td>
                    {row.gapsOver100Ms} / {row.gapsOver250Ms}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
