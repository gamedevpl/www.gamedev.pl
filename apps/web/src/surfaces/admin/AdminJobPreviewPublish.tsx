import { useCallback, useState } from 'react';
import './admin-jobs-queue.css';
import './admin-jobs-preview.css';
import { AdminConfirmDialog } from './AdminConfirmDialog.js';
import { AdminEditorialOverrideDialog } from './AdminEditorialOverrideDialog.js';
import { isEditorialRefusal, publishConfirmCopy, publishRefusalCopy } from './adminJobConfirm.js';
import { publishJob, type JobQueueEntry, type PublishOutcome } from './adminJobsApi.js';

export function AdminJobPreviewPublish({
  job,
  onPublished,
  onMessage,
}: {
  job: JobQueueEntry;
  onPublished?: () => void;
  onMessage: (message: string | null) => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [override, setOverride] = useState<Extract<PublishOutcome, { refused: string }> | null>(null);

  const runPublish = useCallback(
    async (body?: { override?: boolean; overrideReason?: string }) => {
      setPublishing(true);
      onMessage(null);
      try {
        const result = body ? await publishJob(job.jobId, body) : await publishJob(job.jobId);
        if ('refused' in result) {
          onMessage(publishRefusalCopy(result.refused, result.editorial));
          if (isEditorialRefusal(result.refused) && !body?.override) setOverride(result);
          else setOverride(null);
        } else {
          onMessage(`Published ${result.slug} (${result.version})`);
          setOverride(null);
          onPublished?.();
        }
      } catch {
        onMessage('Could not reach the API');
      } finally {
        setPublishing(false);
        setConfirming(false);
      }
    },
    [job.jobId, onMessage, onPublished],
  );

  return (
    <>
      <button
        type="button"
        className="admin-job-publish is-promoted"
        onClick={() => setConfirming(true)}
        disabled={publishing}
      >
        {publishing ? 'Publishing…' : 'Publish Game'}
      </button>
      {confirming ? (
        <AdminConfirmDialog
          {...publishConfirmCopy([job])}
          busy={publishing}
          busyLabel="Publishing…"
          onConfirm={() => void runPublish()}
          onDismiss={() => {
            if (!publishing) setConfirming(false);
          }}
        />
      ) : null}
      {override && isEditorialRefusal(override.refused) ? (
        <AdminEditorialOverrideDialog
          refused={override.refused}
          editorial={override.editorial}
          busy={publishing}
          onConfirm={(reason) => void runPublish({ override: true, overrideReason: reason })}
          onDismiss={() => {
            if (!publishing) setOverride(null);
          }}
        />
      ) : null}
    </>
  );
}
