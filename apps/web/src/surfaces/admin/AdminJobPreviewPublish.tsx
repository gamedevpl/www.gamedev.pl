import { useCallback, useState } from 'react';
import { AdminConfirmDialog } from './AdminConfirmDialog.js';
import { publishConfirmCopy } from './adminJobConfirm.js';
import { publishJob, type JobQueueEntry, type PublishRefusal } from './adminJobsApi.js';

const REFUSAL_COPY: Record<PublishRefusal, string> = {
  gate_red: 'the gate failed this version — read its report before publishing',
  not_gated: 'the gate has not run against this version yet',
  nothing_delivered: 'this build has never delivered a version',
  profile_required: 'the creator has not claimed a public profile — ask them to open Studio and use Claim handle',
  store_unavailable: 'the games store is not configured on this deployment',
  unknown: 'refused, and the reason was not one this console knows',
};

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

  const onPublish = useCallback(async () => {
    setPublishing(true);
    onMessage(null);
    try {
      const result = await publishJob(job.jobId);
      if ('refused' in result) {
        onMessage(REFUSAL_COPY[result.refused]);
      } else {
        onMessage(`Published ${result.slug} (${result.version})`);
        onPublished?.();
      }
    } catch {
      onMessage('Could not reach the API');
    } finally {
      setPublishing(false);
      setConfirming(false);
    }
  }, [job.jobId, onMessage, onPublished]);

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
          onConfirm={() => void onPublish()}
          onDismiss={() => {
            if (!publishing) setConfirming(false);
          }}
        />
      ) : null}
    </>
  );
}
