import type { SubmissionRecord } from '../records/submission.js';

export interface RecoveryAdmission {
  nonce: string;
  until: number;
}

export function permitsRecoveryClaim(admission: RecoveryAdmission | undefined, nonce?: string): boolean {
  if (nonce !== undefined) return admission?.nonce === nonce && admission.until > Date.now();
  return !admission || admission.until <= Date.now();
}

export function isAbandonedRecovery(record: Pick<SubmissionRecord, 'state' | 'recoveryKey'>): boolean {
  return record.state === 'abandoned' && !!record.recoveryKey;
}
