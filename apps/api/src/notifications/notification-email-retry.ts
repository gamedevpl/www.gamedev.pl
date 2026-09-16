import type { EmitDeps } from './notify.js';
import { maybeSendEmail } from './notify.js';

const EMAIL_RETRY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const EMAIL_RETRY_BATCH_LIMIT = 200;

export async function retryPendingNotificationEmails(
  deps: EmitDeps,
  opts: { limit?: number; maxAgeMs?: number; nowMs?: number } = {},
): Promise<void> {
  const nowMs = opts.nowMs ?? deps.now?.() ?? Date.now();
  const maxAgeMs = opts.maxAgeMs ?? EMAIL_RETRY_MAX_AGE_MS;
  const createdAfter = new Date(nowMs - maxAgeMs).toISOString();
  const pending = await deps.store.listPendingEmailNotifications({
    limit: opts.limit ?? EMAIL_RETRY_BATCH_LIMIT,
    createdAfter,
  });
  for (const row of pending) {
    await maybeSendEmail(deps, row.uid, row.notification);
  }
}
