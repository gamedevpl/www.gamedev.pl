import { useCallback, useEffect, useState } from 'react';
import {
  createReviewSweep,
  fetchReviewSweeps,
  patchReviewSweep,
  type ReviewSweepOpen,
  type ReviewSweepsResponse,
  type ReviewSweepSource,
} from './adminApi.js';
import { AssessmentResolutionSummary, AssessmentResolveForm } from './AdminAssessmentResolve.js';
import { fetchAllAdminAssessments, type AdminAssessmentsExport } from './assessmentExportApi.js';
import { formatAssessmentChecklist } from './reviewChecklist.js';
import { formatAssessmentClientContext } from './reviewClientContext.js';

export function AdminAssessmentsPanel() {
  const [data, setData] = useState<AdminAssessmentsExport | null>(null);
  const [sweeps, setSweeps] = useState<ReviewSweepsResponse | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState<ReviewSweepSource>('catalog');
  const [maxGames, setMaxGames] = useState('40');
  const [releasePerDay, setReleasePerDay] = useState('10');
  const [note, setNote] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [assessments, sweepBody] = await Promise.all([fetchAllAdminAssessments(), fetchReviewSweeps()]);
      if (!sweepBody) {
        setError(true);
        return;
      }
      setData(assessments);
      setSweeps(sweepBody);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyOpen = useCallback(
    async (patch: Parameters<typeof patchReviewSweep>[1]) => {
      if (!sweeps?.open) return;
      setBusy(true);
      setMessage(null);
      try {
        const result = await patchReviewSweep(sweeps.open.id, patch);
        if ('error' in result) {
          setMessage(result.error);
          return;
        }
        setSweeps((prev) => (prev ? { ...prev, open: result.sweep } : prev));
        if (result.notified > 0) setMessage(`notified ${result.notified} reviewer(s)`);
        await load();
      } catch {
        setMessage('could not reach the API');
      } finally {
        setBusy(false);
      }
    },
    [load, sweeps?.open],
  );

  const startSweep = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const max = Number(maxGames);
    const rate = releasePerDay.trim() === '' ? null : Number(releasePerDay);
    if (!Number.isInteger(max) || max < 1) {
      setMessage('max games must be a positive integer');
      setBusy(false);
      return;
    }
    if (rate !== null && (!Number.isInteger(rate) || rate < 1)) {
      setMessage('release/day must be empty (all at once) or a positive integer');
      setBusy(false);
      return;
    }
    try {
      const result = await createReviewSweep({
        source,
        maxGames: max,
        releasePerDay: rate,
        note: note.trim() || null,
        notify: true,
      });
      if ('error' in result) {
        setMessage(result.error);
        return;
      }
      setMessage(
        `sweep ${result.sweep.id} open — ${result.sweep.progress.released}/${result.sweep.progress.total} released` +
          (result.notified ? `, notified ${result.notified}` : ''),
      );
      await load();
    } catch {
      setMessage('could not reach the API');
    } finally {
      setBusy(false);
    }
  }, [load, maxGames, note, releasePerDay, source]);

  if (error) return <p className="health-empty">Could not read assessments.</p>;
  if (!data || !sweeps) return <p className="health-empty">Loading assessments…</p>;

  return (
    <div className="admin-assessments">
      <SweepControls
        open={sweeps.open}
        reviewerCount={sweeps.reviewerCount}
        recent={sweeps.recent}
        busy={busy}
        message={message}
        source={source}
        maxGames={maxGames}
        releasePerDay={releasePerDay}
        note={note}
        onSource={setSource}
        onMaxGames={setMaxGames}
        onReleasePerDay={setReleasePerDay}
        onNote={setNote}
        onStart={() => void startSweep()}
        onPatch={(patch) => void applyOpen(patch)}
      />

      {data.total === 0 ? (
        <p className="health-empty">
          No assessments yet. Start a sweep above, then point reviewers at <code>/review</code>.
        </p>
      ) : (
        <>
          <p className="admin-assessments-summary">
            {data.total} assessment{data.total === 1 ? '' : 's'} across {data.games.length} game
            {data.games.length === 1 ? '' : 's'} · {data.resolved} resolved, {data.open} open.{' '}
            <button
              type="button"
              className="admin-assessments-export"
              onClick={() => {
                void navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(
                  () => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  },
                  () => setMessage('could not copy assessments'),
                );
              }}
            >
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
            <span className="admin-assessments-slug">
              {' '}
              → paste into a coding agent (skill <code>ingest-desk-reviews</code>).
            </span>
          </p>

          <table className="admin-assessments-table">
            <thead>
              <tr>
                <th scope="col">Game</th>
                <th scope="col">Keep</th>
                <th scope="col">Cut</th>
                <th scope="col">Skip</th>
                <th scope="col">Notes</th>
                <th scope="col">Open</th>
              </tr>
            </thead>
            <tbody>
              {data.games.map((game) => (
                <tr key={game.slug}>
                  <td>
                    <strong>{game.title}</strong>
                    <div className="admin-assessments-slug">{game.slug}</div>
                  </td>
                  <td>{game.keep}</td>
                  <td className={game.cut > 0 ? 'is-warn' : undefined}>{game.cut}</td>
                  <td>{game.skip}</td>
                  <td>{game.notes}</td>
                  <td className={game.open > 0 ? 'is-warn' : undefined}>
                    {game.open === 0 ? 'all resolved' : `${game.open} of ${game.open + game.resolved}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="admin-assessments-recent-title">
            Recent
            <label className="admin-resolution-filter">
              <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} />
              unresolved only
            </label>
          </h3>
          <ul className="admin-assessments-recent">
            {data.recent
              .filter((row) => !onlyOpen || row.resolution === null)
              .slice(0, 40)
              .map((row) => {
                const env = formatAssessmentClientContext(row.clientContext);
                const checklist = formatAssessmentChecklist(row.checklist);
                return (
                  <li key={row.id}>
                    <span className={`admin-verdict is-${row.verdict}`}>{row.verdict}</span>{' '}
                    <strong>{row.title}</strong>
                    <span className="admin-assessments-slug"> {row.slug}</span>
                    {checklist ? <div className="admin-assessments-checklist">{checklist}</div> : null}
                    {env ? <div className="admin-assessments-env">{env}</div> : null}
                    {row.note ? <p className="admin-assessments-note">{row.note}</p> : null}
                    {row.resolution ? <AssessmentResolutionSummary resolution={row.resolution} /> : null}
                    <AssessmentResolveForm
                      key={`${row.id}:${row.updatedAt}:${row.resolution?.resolvedAt ?? 'open'}`}
                      row={row}
                      onSaved={() => void load()}
                    />
                  </li>
                );
              })}
          </ul>
        </>
      )}
    </div>
  );
}

function SweepControls(props: {
  open: ReviewSweepOpen | null;
  reviewerCount: number;
  recent: ReviewSweepsResponse['recent'];
  busy: boolean;
  message: string | null;
  source: ReviewSweepSource;
  maxGames: string;
  releasePerDay: string;
  note: string;
  onSource: (value: ReviewSweepSource) => void;
  onMaxGames: (value: string) => void;
  onReleasePerDay: (value: string) => void;
  onNote: (value: string) => void;
  onStart: () => void;
  onPatch: (patch: Parameters<typeof patchReviewSweep>[1]) => void;
}) {
  const { open } = props;
  return (
    <section className="admin-review-sweep">
      <h2 className="health-section-title">Review sweeps</h2>
      <p className="health-summary">
        Dispatches a bounded set of games to the review desk. Reviewers ({props.reviewerCount} on the allowlist) get an
        in-app / email / push ping. The desk stays empty until a sweep is active.
      </p>

      {open ? (
        <div className="admin-review-sweep-open">
          <p>
            <strong>{open.id}</strong> · {open.status} · {open.source} · {open.progress.released}/{open.progress.total}{' '}
            released · {open.progress.assessedReleased} assessed
            {open.releasePerDay != null ? ` · drip ${open.releasePerDay}/day` : ' · no drip'}
          </p>
          {open.note ? <p className="admin-assessments-note">{open.note}</p> : null}
          <p className="admin-assessments-slug">
            preview: {open.slugsPreview.slice(0, 12).join(', ')}
            {open.slugs.length > 12 ? '…' : ''}
          </p>
          <div className="admin-review-sweep-actions">
            {open.status === 'active' ? (
              <button type="button" disabled={props.busy} onClick={() => props.onPatch({ status: 'paused' })}>
                Pause
              </button>
            ) : (
              <button type="button" disabled={props.busy} onClick={() => props.onPatch({ status: 'active' })}>
                Resume
              </button>
            )}
            <button
              type="button"
              disabled={props.busy || open.progress.remainingInPool === 0}
              onClick={() => props.onPatch({ releaseMore: open.releasePerDay ?? 10, notify: true })}
            >
              Release more + notify
            </button>
            <button
              type="button"
              disabled={props.busy || open.progress.remainingInPool === 0}
              onClick={() => props.onPatch({ releaseAll: true, notify: true })}
            >
              Release all + notify
            </button>
            <button type="button" disabled={props.busy} onClick={() => props.onPatch({ notify: true })}>
              Notify again
            </button>
            <button type="button" disabled={props.busy} onClick={() => props.onPatch({ status: 'completed' })}>
              Complete
            </button>
            <button type="button" disabled={props.busy} onClick={() => props.onPatch({ status: 'cancelled' })}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="health-empty">No open sweep — start one below.</p>
      )}

      <div className="admin-review-sweep-form">
        <label>
          Source
          <select
            value={props.source}
            disabled={props.busy}
            onChange={(event) => props.onSource(event.target.value as ReviewSweepSource)}
          >
            <option value="catalog">Catalog</option>
            <option value="creator">Creator drafts</option>
            <option value="all">All</option>
          </select>
        </label>
        <label>
          Max games
          <input
            type="number"
            min={1}
            max={500}
            value={props.maxGames}
            disabled={props.busy}
            onChange={(event) => props.onMaxGames(event.target.value)}
          />
        </label>
        <label>
          Release / day
          <input
            type="number"
            min={1}
            max={200}
            placeholder="all at once"
            value={props.releasePerDay}
            disabled={props.busy}
            onChange={(event) => props.onReleasePerDay(event.target.value)}
          />
        </label>
        <label className="admin-review-sweep-note">
          Note
          <input
            type="text"
            maxLength={280}
            value={props.note}
            disabled={props.busy}
            placeholder="optional — shown in the notification"
            onChange={(event) => props.onNote(event.target.value)}
          />
        </label>
        <button type="button" disabled={props.busy} onClick={props.onStart}>
          {open ? 'Start new sweep (cancels open)' : 'Start sweep + notify'}
        </button>
      </div>

      {props.message ? <p className="admin-review-sweep-message">{props.message}</p> : null}

      {props.recent.length > 0 ? (
        <>
          <h3 className="admin-assessments-recent-title">Recent sweeps</h3>
          <ul className="admin-assessments-recent">
            {props.recent.map((row) => (
              <li key={row.id}>
                <strong>{row.id}</strong> · {row.status} · {row.released}/{row.total}
                {row.notifiedAt ? ` · notified ${row.notifiedCount}` : ''}
                {row.note ? <p className="admin-assessments-note">{row.note}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
