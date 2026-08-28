import { useEffect, useState } from 'react';
import { AdminJobPreviewPublish } from './AdminJobPreviewPublish.js';
import { fetchJobPreview, type JobPreview, type JobQueueEntry } from './adminJobsApi.js';
import { GameFrame } from '../../GameFrame.js';

export function AdminJobPreviewModal({
  job,
  onClose,
  onPublished,
}: {
  job: JobQueueEntry;
  onClose: () => void;
  onPublished?: () => void;
}) {
  const [preview, setPreview] = useState<JobPreview | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setMessage(null);

    void fetchJobPreview(job.jobId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setState('error');
        } else {
          setPreview(data);
          setState('ready');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [job.jobId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="admin-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${job.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="admin-preview-modal">
        <header className="admin-preview-header">
          <div className="admin-preview-info">
            <h3 className="admin-preview-title">{job.title}</h3>
            <div className="admin-preview-meta">
              <span>#{job.jobId}</span>
              {job.slug ? <span>· {job.slug}</span> : null}
              {preview?.version ? <span>· {preview.version}</span> : null}
              <span className={`admin-job-state-badge admin-job-state-badge--${job.state}`}>{job.state}</span>
            </div>
          </div>
          <div className="admin-preview-actions">
            {job.state === 'ready_for_review' && (
              <AdminJobPreviewPublish job={job} onPublished={onPublished} onMessage={setMessage} />
            )}
            <button type="button" className="admin-preview-close-btn" onClick={onClose} aria-label="Close preview">
              ✕
            </button>
          </div>
        </header>

        <div className="admin-preview-body">
          {state === 'loading' && <div className="admin-preview-state">Loading game preview…</div>}
          {state === 'error' && (
            <div className="admin-preview-state is-error">No playable preview available for this build yet.</div>
          )}
          {state === 'ready' && preview && (
            <div className="admin-preview-frame-wrap">
              <GameFrame html={preview.html} title={preview.title} embed autoFocus />
            </div>
          )}
        </div>

        {message && <footer className="admin-preview-footer">{message}</footer>}
      </div>
    </div>
  );
}
