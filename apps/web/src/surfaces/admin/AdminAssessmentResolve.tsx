import { useState } from 'react';
import {
  resolveAssessment,
  type AssessmentResolution,
  type AssessmentResolutionStatus,
  type GameAssessment,
} from '../../reviewApi.js';

const STATUS_LABELS: Record<AssessmentResolutionStatus, string> = {
  addressed: 'Addressed',
  wont_fix: "Won't fix",
  deferred: 'Deferred',
};

export function AssessmentResolutionSummary({ resolution }: { resolution: AssessmentResolution }) {
  return (
    <div className={`admin-assessment-resolution is-${resolution.status}`}>
      <span className="admin-resolution-status">{STATUS_LABELS[resolution.status]}</span>{' '}
      <span className="admin-assessments-slug">
        {resolution.resolvedBy} · {resolution.resolvedAt.slice(0, 10)}
      </span>
      <p className="admin-assessments-note">{resolution.comment}</p>
      {resolution.link ? <p className="admin-assessments-slug">{resolution.link}</p> : null}
    </div>
  );
}

// Comment required; Clear withdraws one filed by mistake.
export function AssessmentResolveForm(props: { row: GameAssessment; onSaved: () => void }) {
  const { row } = props;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AssessmentResolutionStatus>(row.resolution?.status ?? 'addressed');
  const [comment, setComment] = useState(row.resolution?.comment ?? '');
  const [link, setLink] = useState(row.resolution?.link ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: AssessmentResolutionStatus | null) {
    setBusy(true);
    setError(null);
    try {
      await resolveAssessment({
        slug: row.slug,
        reviewerUid: row.reviewerUid,
        expectedUpdatedAt: row.updatedAt,
        status: next,
        comment: next === null ? undefined : comment.trim(),
        link: next === null ? undefined : link.trim() || null,
      });
      setOpen(false);
      props.onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'could not save the resolution';
      setError(
        message === 'stale_verdict' ? 'this game was re-assessed — reload and resolve the new verdict' : message,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="admin-resolution-actions">
        <button type="button" className="admin-assessments-export" onClick={() => setOpen(true)}>
          {row.resolution ? 'Edit resolution' : 'Resolve'}
        </button>
        {row.resolution ? (
          <button type="button" className="admin-assessments-export" disabled={busy} onClick={() => void save(null)}>
            Clear
          </button>
        ) : null}
        {error ? <span className="admin-resolution-error">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="admin-resolution-form">
      <label>
        Outcome
        <select
          value={status}
          disabled={busy}
          onChange={(event) => setStatus(event.target.value as AssessmentResolutionStatus)}
        >
          {(Object.keys(STATUS_LABELS) as AssessmentResolutionStatus[]).map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-resolution-comment">
        What was done
        <textarea
          rows={3}
          maxLength={2000}
          value={comment}
          disabled={busy}
          placeholder="e.g. rebuilt the touch controls and re-tuned the first level"
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      <label className="admin-resolution-link">
        Where it landed
        <input
          type="text"
          maxLength={300}
          value={link}
          disabled={busy}
          placeholder="optional — PR, commit, issue"
          onChange={(event) => setLink(event.target.value)}
        />
      </label>
      <div className="admin-resolution-actions">
        <button type="button" disabled={busy || !comment.trim()} onClick={() => void save(status)}>
          Save resolution
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error ? <p className="admin-resolution-error">{error}</p> : null}
    </div>
  );
}
