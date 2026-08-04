import { erasePlayerSignals, type ErasePlayerSignalsResult } from './erase-player-signals.js';
import type { AccountIdentityDeletionResult, Store } from './store.js';

export interface EraseAccountResult {
  signals: ErasePlayerSignalsResult;
  identity: AccountIdentityDeletionResult;
}

export class OperatorAccountDeletionError extends Error {
  constructor() {
    super('operator accounts must be demoted before deletion');
    this.name = 'OperatorAccountDeletionError';
  }
}

/**
 * Complete account erasure shared by self-service deletion and the operator CLI.
 *
 * Published games remain in the arcade under the platform owner. Unpublished jobs are
 * abandoned, and every submission is unlinked from the person's uid. The player-data
 * pass runs first because its indexed reads are deliberately ordered before writes;
 * both halves are idempotent so an interrupted operator run can be repeated safely.
 */
export async function eraseAccount(options: {
  store: Store;
  uid: string;
  dryRun?: boolean;
  at?: string;
  adminUids?: ReadonlySet<string>;
}): Promise<EraseAccountResult> {
  if (options.adminUids?.has(options.uid)) throw new OperatorAccountDeletionError();
  const dryRun = options.dryRun ?? false;
  const signals = await erasePlayerSignals({ store: options.store, uid: options.uid, dryRun });
  const submissions = await options.store.listSubmissionsByOwner(options.uid);
  const preview: AccountIdentityDeletionResult = {
    publishedSlugs: submissions
      .filter((submission) => Boolean(submission.publishedAt && submission.slug))
      .map((submission) => submission.slug!)
      .sort(),
    unpublishedSlugs: submissions
      .filter((submission) => !submission.publishedAt && submission.slug)
      .map((submission) => submission.slug!)
      .sort(),
  };
  const identity = dryRun
    ? preview
    : await options.store.deleteAccountIdentity(options.uid, options.at ?? new Date().toISOString());
  return { signals, identity };
}
