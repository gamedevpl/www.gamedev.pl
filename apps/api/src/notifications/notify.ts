// Notification emission (docs/notifications-plan.md). One idempotent entry point
// that both detection paths converge on — the Cloud Scheduler sweep and the
// opportunistic detection on a browser status poll — so double-detection is a
// no-op. Writes an in-app notification now; email fan-out (M1.5) will slot in
// here alongside the unsubscribe path, which is why the store already carries the
// emailedAt column.

import {
  digestNotificationMessage,
  digestPushContent,
  normalizeLocale,
  operatorNotificationMessage,
  operatorPushContent,
  proposalNotificationMessage,
  proposalPushContent,
  submissionNotificationMessage,
  followedGamePushContent,
  submissionPushContent,
  type DigestEmailParams,
  type OperatorEmailParams,
} from './email-templates.js';
import { createMailerFromEnv, type Mailer } from './mailer.js';
import type { JobAlert } from './operator-alerts.js';
import { createPusherFromEnv, type Pusher } from './pusher.js';
import type {
  NotificationType,
  OperatorNotificationType,
  ProposalNotificationType,
  StoredNotification,
  SubmissionNotificationType,
  SubmissionRecord,
  Store,
} from '../platform/store.js';
import type {
  SubmissionPublishedResponse,
  SubmissionStatus,
  SubmissionStatusResponse,
} from '../platform/submission-status.js';
import { mintUnsubscribeToken } from './unsubscribe-token.js';

const SHORT_TYPE: Record<SubmissionNotificationType, string> = {
  'submission.building': 'building',
  'submission.published': 'published',
  'submission.needs_changes': 'needs-changes',
  'submission.game_health': 'game-health',
};

// Which derived statuses are worth a notification, and as which event. queued,
// publishing, and (deliberately) in_review-vs-building share one "it's building"
// event so a WIP→ready flip doesn't double-notify. Idempotent ids back this up.
const STATUS_TO_EVENT: Partial<Record<SubmissionStatus, SubmissionNotificationType>> = {
  building: 'submission.building',
  in_review: 'submission.building',
  published: 'submission.published',
  needs_changes: 'submission.needs_changes',
};

export function statusToEvent(status: SubmissionStatus): SubmissionNotificationType | null {
  return STATUS_TO_EVENT[status] ?? null;
}

/** Narrows a stored notification's type, so the two audiences cannot be crossed by accident. */
function isOperatorNotification(type: NotificationType): type is OperatorNotificationType {
  return type.startsWith('operator.');
}

/** Same narrowing for the proposal family, which has its own copy — see email-templates. */
function isProposalNotification(type: NotificationType): type is ProposalNotificationType {
  return type.startsWith('proposal.');
}

/**
 * Join an app origin and an in-app path into an absolute URL without double slashes.
 * Rejects absolute / protocol-relative inputs so a poisoned notification.link cannot
 * turn email/push CTAs into an open redirect.
 */
export function absoluteAppUrl(base: string, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    throw new Error(`absoluteAppUrl: expected in-app path, got ${JSON.stringify(path)}`);
  }
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const url = new URL(path, normalizedBase);
  const baseOrigin = new URL(normalizedBase).origin;
  if (url.origin !== baseOrigin) {
    throw new Error(`absoluteAppUrl: path escaped origin (${url.origin})`);
  }
  return url.toString();
}

export interface EmitDeps {
  store: Store;
  now?: () => number;
  /** When set (with unsubscribeSecret), notifications also fan out to email. */
  mailer?: Mailer;
  /** When set, notifications also fan out to the user's Web Push subscriptions. */
  pusher?: Pusher;
  /** Absolute origin used to build email links, e.g. https://www.gamedev.pl */
  appBaseUrl?: string;
  /** Secret for signing the one-click unsubscribe token. */
  unsubscribeSecret?: string;
  /** Optional logger for best-effort email failures (they're retried next sweep). */
  logError?: (err: unknown, msg: string) => void;
}

/**
 * Best-effort notification email. Skips silently when email isn't configured, the
 * user has no address or has unsubscribed, or the notification was already emailed.
 * A send failure leaves emailedAt null so the next sweep retries. Never throws.
 */
async function maybeSendEmail(deps: EmitDeps, uid: string, notification: StoredNotification): Promise<void> {
  if (notification.emailedAt) return;
  // Operator alerts have their own send (see `emitOperatorAlert`): they carry no
  // unsubscribe and must not be silenced by one. Guarded here rather than left to the
  // call sites so a future caller cannot accidentally route one through creator mail.
  if (isOperatorNotification(notification.type)) return;

  // Explicit deps win (tests inject them). Otherwise fall back to env config so
  // the default call sites send email in prod with no extra wiring: a real mailer
  // only when RESEND_API_KEY is set (no false "sent" via the console fake), and
  // the unsubscribe secret from SESSION_SECRET.
  const mailer = deps.mailer ?? (process.env.RESEND_API_KEY ? createMailerFromEnv() : undefined);
  const unsubscribeSecret = deps.unsubscribeSecret ?? process.env.SESSION_SECRET;
  if (!mailer || !unsubscribeSecret) return;

  try {
    const user = await deps.store.getUser(uid);
    if (!user?.email || user.emailUnsubscribedAt) return;

    const appBaseUrl = deps.appBaseUrl ?? process.env.APP_BASE_URL?.trim() ?? 'https://www.gamedev.pl';
    const actionUrl = absoluteAppUrl(appBaseUrl, notification.link);
    // A digest's unsubscribe narrows to the digest. Clicking "unsubscribe" on a weekly
    // summary must not also silence "your game is published" — that is the message the
    // creator actually wants, and losing it is how one unwanted email costs us every
    // wanted one.
    const unsubscribePath = `/api/email/unsubscribe?token=${mintUnsubscribeToken(uid, unsubscribeSecret)}`;
    const unsubscribeUrl = absoluteAppUrl(
      appBaseUrl,
      notification.type === 'creator.digest' ? `${unsubscribePath}&scope=digest` : unsubscribePath,
    );
    const locale = normalizeLocale(user.locale);
    // Three families, three sentences. A proposal is not a submission event — the actor
    // is a second person — so routing one through the submission copy would mail a
    // creator "«your game» has a proposed change waiting for you" with no idea who from.
    const emailParams = { title: notification.params.title ?? '', actionUrl, unsubscribeUrl };
    const message =
      notification.type === 'game.new_version'
        ? // Deliberately not emailed yet. An email about somebody else's game needs its
          // own unsubscribe scope — the digest has one for exactly this reason — and a
          // follow that silences "your game is published" would be a worse bug than the
          // missing mail. In-app and push carry it until that scope exists.
          null
        : notification.type === 'creator.digest'
          ? digestNotificationMessage(user.email, locale, digestEmailParams(notification, actionUrl, unsubscribeUrl))
          : isProposalNotification(notification.type)
            ? proposalNotificationMessage(user.email, locale, notification.type, emailParams)
            : submissionNotificationMessage(user.email, locale, notification.type, emailParams);

    if (!message) return;
    await mailer.send(message);
    await deps.store.markNotificationEmailed(uid, notification.id);
  } catch (err) {
    deps.logError?.(err, 'notification email send failed');
  }
}

/**
 * Best-effort Web Push fan-out to every browser the user opted in on. Skips
 * silently when push isn't configured. Dead subscriptions (404/410) are pruned so
 * the list self-heals; transient errors are ignored (the next event retries).
 * Never throws. Unlike email there's no per-notification "sent" flag — push is
 * cheap and ephemeral, and re-emits are idempotent (same `tag` coalesces).
 */
async function maybePush(deps: EmitDeps, uid: string, notification: StoredNotification): Promise<void> {
  const pusher = deps.pusher ?? createPusherFromEnv();
  if (!pusher) return;

  try {
    const [user, subscriptions] = await Promise.all([deps.store.getUser(uid), deps.store.listPushSubscriptions(uid)]);
    if (subscriptions.length === 0) return;
    // The digest opt-out is per-notification, not per-channel: someone who asked to stop
    // the weekly summary meant the summary, not just the email carrying it. Without this
    // an unsubscribed creator keeps getting pushed every Monday, which is the version of
    // this bug they cannot fix from their inbox.
    if (notification.type === 'creator.digest' && user?.digestOptOutAt) return;

    const appBaseUrl = deps.appBaseUrl ?? process.env.APP_BASE_URL?.trim() ?? 'https://www.gamedev.pl';
    const locale = normalizeLocale(user?.locale);
    const { title, body } =
      notification.type === 'game.new_version'
        ? followedGamePushContent(locale, notification.params.title ?? '')
        : notification.type === 'creator.digest'
          ? digestPushContent(locale, digestEmailParams(notification, '', ''))
          : isOperatorNotification(notification.type)
            ? // English regardless of the reader's locale — see the operator copy's comment.
              operatorPushContent(notification.type, notification.params.title ?? '')
            : isProposalNotification(notification.type)
              ? proposalPushContent(locale, notification.type, notification.params.title ?? '')
              : submissionPushContent(locale, notification.type, notification.params.title ?? '');
    const payload = { title, body, url: absoluteAppUrl(appBaseUrl, notification.link), tag: notification.id };

    await Promise.all(
      subscriptions.map(async (sub) => {
        const result = await pusher.send({ endpoint: sub.endpoint, keys: sub.keys }, payload);
        if (result.outcome === 'gone') {
          await deps.store.deletePushSubscription(uid, sub.endpoint).catch(() => {});
        }
      }),
    );
  } catch (err) {
    deps.logError?.(err, 'notification push send failed');
  }
}

/**
 * Reads a digest notification's string params back into numbers for rendering.
 *
 * Params are stored as strings so a locale switch re-renders an old notification from its
 * data rather than from text frozen at emission. A missing or malformed value becomes 0
 * rather than NaN — an email reading "NaN play sessions" is worse than one reading "0".
 */
function digestEmailParams(
  notification: StoredNotification,
  actionUrl: string,
  unsubscribeUrl: string,
): DigestEmailParams {
  const num = (key: string): number => {
    const parsed = Number(notification.params[key]);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    games: num('games'),
    sessions: num('sessions'),
    votesUp: num('votesUp'),
    votesDown: num('votesDown'),
    feedback: num('feedback'),
    actionUrl,
    unsubscribeUrl,
  };
}

/**
 * Fan an operator alert out to everyone who can act on it.
 *
 * Deliberately not routed through `maybeSendEmail`: that path is built for creator mail,
 * where an unsubscribe is a right and a send is skipped when it was exercised. An alert
 * is the opposite kind of message — the queue telling its operator it needs them — and a
 * pager that someone silenced eighteen months ago by clicking "unsubscribe" on a build
 * notification would fail exactly when it mattered and say nothing about why.
 *
 * The in-app notification is still the durable record, and its id is the alert's, so a
 * sweep running every two minutes emits each situation once.
 */
export async function emitOperatorAlert(
  deps: EmitDeps & { adminUids: Iterable<string> },
  alert: JobAlert,
): Promise<{ created: number }> {
  const createdAt = deps.now ? new Date(deps.now()).toISOString() : new Date().toISOString();
  const type: OperatorNotificationType = `operator.${alert.kind}`;
  let created = 0;

  for (const uid of deps.adminUids) {
    const result = await deps.store.createNotification(uid, {
      id: alert.id,
      type,
      createdAt,
      titleKey: `notifications.${type}.title`,
      bodyKey: `notifications.${type}.body`,
      params: {
        title: alert.title,
        issueNumber: String(alert.issueNumber),
        ...(alert.stall ? { detail: alert.stall } : {}),
      },
      link: OPERATOR_ALERT_LINK,
    });
    if (!result.created) continue;
    created += 1;
    await sendOperatorEmail(deps, uid, alert.id, type, OPERATOR_ALERT_LINK, {
      title: alert.title,
      issueNumber: alert.issueNumber,
      ...(alert.stall ? { detail: alert.stall } : {}),
    });
    await maybePush(deps, uid, result.notification);
  }

  return { created };
}

/**
 * Tell every operator someone asked to join the closed beta.
 *
 * Same fan-out as `emitOperatorAlert` (in-app + email + push, no unsubscribe), but not
 * shaped like a job: there is no issue number, and the deep link is the Waitlist panel
 * where the applicant can be approved rather than the build queue. Idempotent per
 * applicant uid (`op-waitlist-{uid}`), so a visitor who clicks Join twice is one
 * notification.
 */
export async function emitWaitlistJoined(
  deps: EmitDeps & { adminUids: Iterable<string> },
  event: { uid: string; title: string; email?: string },
): Promise<{ created: number }> {
  const createdAt = deps.now ? new Date(deps.now()).toISOString() : new Date().toISOString();
  const type: OperatorNotificationType = 'operator.waitlist_joined';
  const id = `op-waitlist-${event.uid}`;
  let created = 0;

  for (const uid of deps.adminUids) {
    const result = await deps.store.createNotification(uid, {
      id,
      type,
      createdAt,
      titleKey: `notifications.${type}.title`,
      bodyKey: `notifications.${type}.body`,
      params: {
        title: event.title,
        ...(event.email ? { email: event.email } : {}),
      },
      link: WAITLIST_ALERT_LINK,
    });
    if (!result.created) continue;
    created += 1;
    await sendOperatorEmail(deps, uid, id, type, WAITLIST_ALERT_LINK, {
      title: event.title,
      ...(event.email ? { email: event.email } : {}),
    });
    await maybePush(deps, uid, result.notification);
  }

  return { created };
}

/** Where an operator notification lands: the queue, which is where the action is. */
const OPERATOR_ALERT_LINK = '/admin/queue';

/** Waitlist joins land on the membership panel — that is where the applicant is acted on. */
const WAITLIST_ALERT_LINK = '/admin/waitlist';

const REVIEW_SWEEP_LINK = '/review';

// Fan out review-sweep alerts to every reviewer.
export async function emitReviewSweep(
  deps: EmitDeps & { reviewerUids: Iterable<string> },
  event: { notificationId: string; title: string; detail?: string },
): Promise<{ created: number }> {
  const createdAt = deps.now ? new Date(deps.now()).toISOString() : new Date().toISOString();
  const type: OperatorNotificationType = 'operator.review_sweep';
  let created = 0;

  for (const uid of deps.reviewerUids) {
    const result = await deps.store.createNotification(uid, {
      id: event.notificationId,
      type,
      createdAt,
      titleKey: `notifications.${type}.title`,
      bodyKey: `notifications.${type}.body`,
      params: {
        title: event.title,
        ...(event.detail ? { detail: event.detail } : {}),
      },
      link: REVIEW_SWEEP_LINK,
    });
    if (!result.created) continue;
    created += 1;
    await sendOperatorEmail(deps, uid, event.notificationId, type, REVIEW_SWEEP_LINK, {
      title: event.title,
      ...(event.detail ? { detail: event.detail } : {}),
    });
    await maybePush(deps, uid, result.notification);
  }

  return { created };
}

/**
 * Best-effort, like every other send here: a failed alert email must not fail the caller.
 *
 * `actionUrl` is built here — after the mailer early-return — so a bad `APP_BASE_URL`
 * cannot abort the operator fan-out loop before in-app + push land for everyone else.
 */
async function sendOperatorEmail(
  deps: EmitDeps,
  uid: string,
  notificationId: string,
  type: OperatorNotificationType,
  link: string,
  params: Omit<OperatorEmailParams, 'actionUrl'>,
): Promise<void> {
  const mailer = deps.mailer ?? (process.env.RESEND_API_KEY ? createMailerFromEnv() : undefined);
  if (!mailer) return;

  try {
    const user = await deps.store.getUser(uid);
    if (!user?.email) return;
    const appBaseUrl = deps.appBaseUrl ?? process.env.APP_BASE_URL?.trim() ?? 'https://www.gamedev.pl';
    const actionUrl = absoluteAppUrl(appBaseUrl, link);
    await mailer.send(operatorNotificationMessage(user.email, type, { ...params, actionUrl }));
    await deps.store.markNotificationEmailed(uid, notificationId);
  } catch (err) {
    deps.logError?.(err, 'operator alert email send failed');
  }
}

export interface SubmissionNotificationEvent {
  /** Owner of the submission — the notification recipient. */
  uid: string;
  type: SubmissionNotificationType;
  issueNumber: number;
  /** Sanitized game title, shown in the notification text. */
  gameTitle: string;
  /** Status-page share token — the default deep link. */
  statusToken: string;
  /** Present for `submission.published`: deep-link straight to the playable game. */
  slug?: string;
}

export interface FollowedGameNotificationEvent {
  /** The follower being told, never the creator — they have their own publish note. */
  uid: string;
  slug: string;
  gameTitle: string;
  /** The version that just went live; part of the id so each release notifies once. */
  version: string;
  link: string;
}

/**
 * Tell one follower that a game they follow published a new version.
 *
 * Idempotent by `follow-<slug>-<version>`: a republish of the same version (a retried
 * operator click, a reconciliation pass) must not notify twice, and a genuinely new
 * version must. Emission is per-follower rather than batched because the store's
 * notification model is per-user, and because a failure to reach one follower must not
 * cost the rest theirs.
 */
export async function emitFollowedGameNotification(
  deps: EmitDeps,
  event: FollowedGameNotificationEvent,
): Promise<{ created: boolean }> {
  const { created, notification } = await deps.store.createNotification(event.uid, {
    id: `follow-${event.slug}-${event.version}`,
    type: 'game.new_version',
    createdAt: new Date(deps.now?.() ?? Date.now()).toISOString(),
    titleKey: 'notifications.game.new_version.title',
    bodyKey: 'notifications.game.new_version.body',
    params: { title: event.gameTitle, slug: event.slug },
    link: event.link,
  });

  await maybeSendEmail(deps, event.uid, notification);
  if (created) await maybePush(deps, event.uid, notification);

  return { created };
}

export interface DigestNotificationEvent {
  uid: string;
  /** Week-keyed id, so a sweep that runs twice in one week emits once. */
  id: string;
  /** Counts only — see digest.ts for why no player-written text travels this path. */
  params: Record<string, string>;
  link: string;
  createdAt: string;
}

/**
 * Emit a creator's weekly digest (docs/improvement-loop-plan.md IL-2).
 *
 * Lives here rather than in digest.ts so it shares the email and Web Push fan-out with
 * submission notifications, including their unsubscribe handling and the `emailedAt` retry
 * flag. A digest that delivered through its own path would be a second place for
 * "respect the unsubscribe" to be got wrong.
 */
export async function emitDigestNotification(
  deps: EmitDeps,
  event: DigestNotificationEvent,
): Promise<{ created: boolean }> {
  const { created, notification } = await deps.store.createNotification(event.uid, {
    id: event.id,
    type: 'creator.digest',
    createdAt: event.createdAt,
    titleKey: 'notifications.creator.digest.title',
    bodyKey: 'notifications.creator.digest.body',
    params: event.params,
    link: event.link,
  });

  await maybeSendEmail(deps, event.uid, notification);
  if (created) await maybePush(deps, event.uid, notification);

  return { created };
}

/**
 * Emit a creator submission notification. Idempotent by a deterministic id
 * (`sub-<issue>-<event>`), so the sweep can re-run and the poll path can race it
 * without producing duplicates. Returns whether a new notification was created.
 */
export async function emitSubmissionNotification(
  deps: EmitDeps,
  event: SubmissionNotificationEvent,
): Promise<{ created: boolean }> {
  const id = `sub-${event.issueNumber}-${SHORT_TYPE[event.type]}`;
  const now = deps.now ? new Date(deps.now()).toISOString() : new Date().toISOString();

  // Published games deep-link to play; the health nudge to the studio, where the
  // improvement round it is asking for actually starts; everything else to the
  // status page.
  const link =
    event.type === 'submission.published' && event.slug
      ? `/play/${event.slug}`
      : event.type === 'submission.game_health'
        ? '/studio'
        : `/status/${event.statusToken}`;

  const { created, notification } = await deps.store.createNotification(event.uid, {
    id,
    type: event.type,
    createdAt: now,
    titleKey: `notifications.${event.type}.title`,
    bodyKey: `notifications.${event.type}.body`,
    params: { title: event.gameTitle },
    link,
  });

  // Fan out to email (best effort, idempotent via emailedAt). Runs on a fresh
  // notification and also retries one whose earlier send failed (emailedAt null).
  await maybeSendEmail(deps, event.uid, notification);

  // Fan out to Web Push (best effort). Only on a freshly created notification —
  // push is a transient "ping", so re-emitting an already-delivered one would just
  // re-ping every device; the in-app + email records already cover durability.
  if (created) {
    await maybePush(deps, event.uid, notification);
  }

  return { created };
}

/** One proposal event, for whichever side of it is being told. */
export interface ProposalNotificationEvent {
  /** Who is being told — the reviewer for `awaiting_review`, the proposer otherwise. */
  uid: string;
  type: ProposalNotificationType;
  proposalId: string;
  /** The game's title, or its slug when no title is to hand. Rendered in the copy. */
  gameTitle: string;
}

/**
 * Tell somebody about a proposal.
 *
 * The id is keyed by proposal and event rather than by job, because a proposal has no job
 * — deliberately, since one owned by the proposer against the target's slug is what the
 * ownership rule reads as a transfer. Idempotent on that id, so a retried sweep or a
 * double-decided race re-emits nothing.
 *
 * Links differ by audience: the reviewer goes to the game they own, the proposer to their
 * own tracker. Sending both to one place is how somebody lands on a page that has no row
 * for the thing they were just told about.
 */
export async function emitProposalNotification(
  deps: EmitDeps,
  event: ProposalNotificationEvent,
): Promise<{ created: boolean }> {
  const now = deps.now ? new Date(deps.now()).toISOString() : new Date().toISOString();
  const shortType = event.type.slice('proposal.'.length);
  const link = event.type === 'proposal.awaiting_review' ? '/studio' : '/proposals';

  const { created, notification } = await deps.store.createNotification(event.uid, {
    id: `prop-${event.proposalId}-${shortType}`,
    type: event.type,
    createdAt: now,
    titleKey: `notifications.${event.type}.title`,
    bodyKey: `notifications.${event.type}.body`,
    params: { title: event.gameTitle },
    link,
  });

  await maybeSendEmail(deps, event.uid, notification);
  if (created) await maybePush(deps, event.uid, notification);
  return { created };
}

/**
 * The transition gate both detection paths share: given a submission's record and
 * its freshly-derived status, emit the mapped event iff the event changed since
 * `lastNotifiedStatus`, then record the new status. Returns whether it emitted.
 * `statusToken` is the recipient's status-page link (the poll path already has it;
 * the sweep mints one).
 */
export async function notifyOnTransition(
  deps: EmitDeps,
  submission: Pick<SubmissionRecord, 'issueNumber' | 'ownerUid' | 'title' | 'lastNotifiedStatus'>,
  status: SubmissionStatusResponse,
  statusToken: string,
): Promise<{ emitted: boolean }> {
  const event = statusToEvent(status.status);
  if (!event) return { emitted: false };

  const prevEvent = submission.lastNotifiedStatus ? statusToEvent(submission.lastNotifiedStatus) : null;
  if (prevEvent === event) return { emitted: false };

  await emitSubmissionNotification(deps, {
    uid: submission.ownerUid,
    type: event,
    issueNumber: submission.issueNumber,
    gameTitle: submission.title,
    statusToken,
    slug: status.status === 'published' ? (status as SubmissionPublishedResponse).slug : undefined,
  });
  await deps.store.setSubmissionNotifiedStatus(submission.issueNumber, status.status);
  // Stamp the finish line the first time we see it, so build times can be measured
  // (and shown to the next creator as a real expectation instead of a guess).
  if (status.status === 'published') {
    const at = deps.now ? new Date(deps.now()).toISOString() : new Date().toISOString();
    await deps.store.setSubmissionPublishedAt(submission.issueNumber, at);
  }
  return { emitted: true };
}
