import { createMailerFromEnv } from './mailer.js';
import type { EmitDeps } from './notify.js';
import { maybeSendEmail } from './notify.js';
import { retryShareNotificationEmail } from './notify-share.js';
import { TRANSFER_INVITE_TTL_MS } from '../store/records/game-transfer.js';

const EMAIL_RETRY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const EMAIL_RETRY_BATCH_LIMIT = 200;

export interface RetryPendingNotificationEmailsResult {
  scanned: number;
  retried: number;
  sent: number;
  skipped: number;
  failed: number;
  unconfigured: boolean;
}

function isDirectRetryType(type: string): boolean {
  return (
    type.startsWith('submission.') ||
    type.startsWith('proposal.') ||
    type.startsWith('transfer.') ||
    type === 'creator.digest'
  );
}

export function notificationEmailConfigured(deps: EmitDeps): boolean {
  const mailer = deps.mailer ?? (process.env.RESEND_API_KEY ? createMailerFromEnv() : undefined);
  const unsubscribeSecret = deps.unsubscribeSecret ?? process.env.SESSION_SECRET;
  return Boolean(mailer && mailer.name !== 'console' && unsubscribeSecret);
}

export async function retryPendingNotificationEmails(
  deps: EmitDeps,
  opts: { limit?: number; maxAgeMs?: number; nowMs?: number } = {},
): Promise<RetryPendingNotificationEmailsResult> {
  const empty = { scanned: 0, retried: 0, sent: 0, skipped: 0, failed: 0, unconfigured: true };
  if (!notificationEmailConfigured(deps)) return empty;

  const nowMs = opts.nowMs ?? deps.now?.() ?? Date.now();
  const maxAgeMs = opts.maxAgeMs ?? EMAIL_RETRY_MAX_AGE_MS;
  const createdAfter = new Date(nowMs - maxAgeMs).toISOString();
  const pending = await deps.store.listPendingEmailNotifications({
    limit: opts.limit ?? EMAIL_RETRY_BATCH_LIMIT,
    createdAfter,
  });
  let retried = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of pending) {
    const { uid, notification } = row;
    const createdAtMs = Date.parse(notification.createdAt);
    if (
      notification.type === 'game.new_version' ||
      notification.type.startsWith('operator.') ||
      (!Number.isNaN(createdAtMs) &&
        notification.type === 'transfer.offered' &&
        nowMs - createdAtMs > TRANSFER_INVITE_TTL_MS)
    ) {
      await deps.store.markNotificationEmailed(uid, notification.id);
      skipped += 1;
      continue;
    }
    const user = await deps.store.getUser(uid);
    if (
      !user?.email ||
      user.emailUnsubscribedAt ||
      (notification.type === 'creator.digest' && user.digestOptOutAt)
    ) {
      await deps.store.markNotificationEmailed(uid, notification.id);
      skipped += 1;
      continue;
    }
    retried += 1;
    if (notification.type.startsWith('share.')) {
      if (await retryShareNotificationEmail(deps, uid, notification)) sent += 1;
      else failed += 1;
      continue;
    }
    if (!isDirectRetryType(notification.type)) {
      await deps.store.markNotificationEmailed(uid, notification.id);
      skipped += 1;
      retried -= 1;
      continue;
    }
    if (await maybeSendEmail(deps, uid, notification)) sent += 1;
    else failed += 1;
  }
  return { scanned: pending.length, retried, sent, skipped, failed, unconfigured: false };
}
