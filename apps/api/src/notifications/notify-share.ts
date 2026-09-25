import { createMailerFromEnv, type Mailer } from './mailer.js';
import { invalidateNotificationCache } from './notification-cache.js';
import { absoluteAppUrl, type EmitDeps } from './notify.js';
import { shareNotificationMessage, sharePushContent } from './email-templates-share.js';
import { normalizeLocale } from './email-templates.js';
import { createPusherFromEnv, type Pusher } from './pusher.js';
import { mintUnsubscribeToken, unsubscribeSecretFromEnv } from './unsubscribe-token.js';
import type { ShareNotificationType, Store, StoredNotification } from '../platform/store.js';

export interface ShareNotice {
  type: ShareNotificationType;
  uid: string;
  slug: string;
  gameTitle: string;
  actorName: string;
}

function noticeId(event: ShareNotice, at: string): string {
  return `share-${event.type}-${event.slug}-${event.uid}-${at.slice(0, 16)}`;
}

async function createRow(
  store: Store,
  uid: string,
  notification: Parameters<Store['createNotification']>[1],
): ReturnType<Store['createNotification']> {
  const result = await store.createNotification(uid, notification);
  if (result.created) invalidateNotificationCache(store, uid);
  return result;
}

async function sendEmail(
  deps: EmitDeps,
  uid: string,
  type: ShareNotificationType,
  notification: { id: string; link: string; emailedAt: string | null },
  params: { title: string; actorName: string },
): Promise<boolean> {
  if (notification.emailedAt) return false;
  const mailer: Mailer | undefined = deps.mailer ?? (process.env.RESEND_API_KEY ? createMailerFromEnv() : undefined);
  const unsubscribeSecret = deps.unsubscribeSecret ?? unsubscribeSecretFromEnv();
  if (!mailer || !unsubscribeSecret) return false;
  try {
    const user = await deps.store.getUser(uid);
    if (!user?.email || user.emailUnsubscribedAt) return false;
    const appBaseUrl = deps.appBaseUrl ?? process.env.APP_BASE_URL?.trim() ?? 'https://www.gamedev.pl';
    const actionUrl = absoluteAppUrl(appBaseUrl, notification.link);
    const unsubscribeUrl = absoluteAppUrl(
      appBaseUrl,
      `/api/email/unsubscribe?token=${mintUnsubscribeToken(uid, unsubscribeSecret)}`,
    );
    await mailer.send(
      shareNotificationMessage(user.email, normalizeLocale(user.locale), type, {
        title: params.title,
        actorName: params.actorName,
        actionUrl,
        unsubscribeUrl,
      }),
      { idempotencyKey: `share-notification-email:${uid}:${notification.id}` },
    );
    await deps.store.markNotificationEmailed(uid, notification.id);
    return true;
  } catch (err) {
    deps.logError?.(err, 'share notification email send failed');
    return false;
  }
}

export async function retryShareNotificationEmail(
  deps: EmitDeps,
  uid: string,
  notification: StoredNotification,
): Promise<boolean> {
  if (!notification.type.startsWith('share.')) return false;
  const actorName = notification.params.actorName;
  const title = notification.params.title;
  if (!actorName || !title) {
    await deps.store.markNotificationEmailed(uid, notification.id);
    return false;
  }
  return sendEmail(deps, uid, notification.type as ShareNotificationType, notification, { actorName, title });
}

async function sendPush(
  deps: EmitDeps,
  uid: string,
  type: ShareNotificationType,
  params: { title: string; actorName: string },
  link: string,
): Promise<void> {
  const pusher: Pusher | undefined = deps.pusher ?? createPusherFromEnv();
  if (!pusher) return;
  try {
    const [user, subscriptions] = await Promise.all([deps.store.getUser(uid), deps.store.listPushSubscriptions(uid)]);
    if (subscriptions.length === 0) return;
    const locale = normalizeLocale(user?.locale);
    const content = sharePushContent(locale, type, params.title, params.actorName);
    const appBaseUrl = deps.appBaseUrl ?? process.env.APP_BASE_URL?.trim() ?? 'https://www.gamedev.pl';
    const payload = {
      title: content.title,
      body: content.body,
      url: absoluteAppUrl(appBaseUrl, link),
      tag: `share-${type}`,
    };
    await Promise.all(
      subscriptions.map(async (sub) => {
        const result = await pusher.send({ endpoint: sub.endpoint, keys: sub.keys }, payload);
        if (result.outcome === 'gone') {
          await deps.store.deletePushSubscription(uid, sub.endpoint).catch(() => {});
        }
      }),
    );
  } catch (err) {
    deps.logError?.(err, 'share notification push failed');
  }
}

export async function emitShareNotice(deps: EmitDeps, event: ShareNotice): Promise<void> {
  const createdAt = new Date(deps.now?.() ?? Date.now()).toISOString();
  const link = '/studio';
  const { created, notification } = await createRow(deps.store, event.uid, {
    id: noticeId(event, createdAt),
    type: event.type,
    createdAt,
    titleKey: `notifications.share.${event.type.slice('share.'.length)}.title`,
    bodyKey: `notifications.share.${event.type.slice('share.'.length)}.body`,
    params: { title: event.gameTitle, actorName: event.actorName, slug: event.slug },
    link,
  });
  await sendEmail(deps, event.uid, event.type, notification, {
    title: event.gameTitle,
    actorName: event.actorName,
  });
  if (created) {
    await sendPush(deps, event.uid, event.type, { title: event.gameTitle, actorName: event.actorName }, link);
  }
}
