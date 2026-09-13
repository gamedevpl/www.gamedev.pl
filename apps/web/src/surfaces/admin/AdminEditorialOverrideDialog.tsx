import { useState } from 'react';
import { AdminConfirmDialog } from './AdminConfirmDialog.js';
import { editorialOverrideCopy, type EditorialRefusal } from './adminJobConfirm.js';
import type { EditorialCounts } from './adminJobsApi.js';

export function AdminEditorialOverrideDialog({
  refused,
  editorial,
  busy,
  onConfirm,
  onDismiss,
}: {
  refused: EditorialRefusal;
  editorial?: EditorialCounts;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onDismiss: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <AdminConfirmDialog
      {...editorialOverrideCopy(refused, editorial)}
      busy={busy}
      busyLabel="Publishing…"
      reasonLabel="Why override"
      reasonValue={reason}
      onReasonChange={setReason}
      reasonRequired
      onConfirm={() => onConfirm(reason.trim())}
      onDismiss={onDismiss}
    />
  );
}
