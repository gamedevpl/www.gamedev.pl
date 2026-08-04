import { eraseAccount, OperatorAccountDeletionError, type EraseAccountResult } from './erase-account.js';
import type { Store } from './store.js';

export const ACCOUNT_DELETION_GRACE_DAYS = 14;
export const ACCOUNT_DELETION_GRACE_MS = ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
export const ACCOUNT_DELETION_SWEEP_BATCH = 50;

export interface ScheduledAccountDeletion {
  requestedAt: string;
  scheduledFor: string;
}

export async function scheduleAccountDeletion(options: {
  store: Store;
  uid: string;
  adminUids?: ReadonlySet<string>;
  now?: () => number;
  graceMs?: number;
}): Promise<ScheduledAccountDeletion | null> {
  if (options.adminUids?.has(options.uid)) throw new OperatorAccountDeletionError();
  const now = options.now?.() ?? Date.now();
  const requestedAt = new Date(now).toISOString();
  const scheduledFor = new Date(now + (options.graceMs ?? ACCOUNT_DELETION_GRACE_MS)).toISOString();
  const user = await options.store.scheduleAccountDeletion(options.uid, requestedAt, scheduledFor);
  return user ? { requestedAt, scheduledFor } : null;
}

export interface AccountDeletionSweepResult {
  scanned: number;
  deleted: number;
  operatorAccountsSkipped: string[];
  failures: Array<{ uid: string; error: unknown }>;
  erased: EraseAccountResult[];
}

export async function runAccountDeletionSweep(options: {
  store: Store;
  adminUids?: ReadonlySet<string>;
  now?: () => number;
  batchSize?: number;
}): Promise<AccountDeletionSweepResult> {
  const at = new Date(options.now?.() ?? Date.now()).toISOString();
  const due = await options.store.listAccountsDueForDeletion(at, options.batchSize ?? ACCOUNT_DELETION_SWEEP_BATCH);
  const erased: EraseAccountResult[] = [];
  const operatorAccountsSkipped: string[] = [];
  const failures: Array<{ uid: string; error: unknown }> = [];

  for (const user of due) {
    if (options.adminUids?.has(user.uid)) {
      operatorAccountsSkipped.push(user.uid);
      continue;
    }
    try {
      erased.push(
        await eraseAccount({
          store: options.store,
          uid: user.uid,
          at,
          adminUids: options.adminUids,
        }),
      );
    } catch (error) {
      failures.push({ uid: user.uid, error });
    }
  }

  return {
    scanned: due.length,
    deleted: erased.length,
    operatorAccountsSkipped,
    failures,
    erased,
  };
}
