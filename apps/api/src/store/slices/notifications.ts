import { createHash } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { StoredNotification, PushSubscriptionRecord } from '../records/notifications.js';

// Stable doc id for a subscription: a hash of its endpoint URL. Endpoints are long
// and contain characters illegal in Firestore doc ids, and hashing gives idempotent
// re-subscribes for free.
export function pushSubscriptionId(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

export interface NotificationsStore {
  /**
   * Idempotent by notification id: a second emit for the same id is a no-op and
   * returns `created: false` (a crashed/re-run sweep can safely re-emit).
   */
  createNotification(
    uid: string,
    notification: Omit<StoredNotification, 'readAt' | 'emailedAt'> & { createdAt?: string },
  ): Promise<{ created: boolean; notification: StoredNotification }>;

  listNotifications(uid: string, opts?: { limit?: number }): Promise<StoredNotification[]>;

  markNotificationsRead(uid: string, ids: string[] | 'all'): Promise<void>;

  /** Delete notifications by id, or all of them ('all') — the bell's dismiss/clear. */
  deleteNotifications(uid: string, ids: string[] | 'all'): Promise<void>;

  /** Stamp emailedAt after a successful send so retries don't re-send. */
  markNotificationEmailed(uid: string, id: string, at?: string): Promise<void>;

  /** Upsert a browser push subscription (idempotent by endpoint). */
  savePushSubscription(uid: string, subscription: Omit<PushSubscriptionRecord, 'createdAt'>): Promise<void>;

  /** All push subscriptions for a user — the push fan-out sends to each. */
  listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]>;

  /** Remove a subscription (client unsubscribe, or pruning a dead endpoint). */
  deletePushSubscription(uid: string, endpoint: string): Promise<void>;
}

export class InMemoryNotificationsStore implements NotificationsStore {
  // Not private -- deleteAccountIdentity reaches across these (documented exception, see PR).
  notifications = new Map<string, Map<string, StoredNotification>>(); // uid -> (notificationId -> notification)
  pushSubs = new Map<string, Map<string, PushSubscriptionRecord>>(); // uid -> (endpoint-hash -> subscription)

  async createNotification(
    uid: string,
    notification: Omit<StoredNotification, 'readAt' | 'emailedAt'> & { createdAt?: string },
  ): Promise<{ created: boolean; notification: StoredNotification }> {
    const forUser = this.notifications.get(uid) ?? new Map<string, StoredNotification>();
    const existing = forUser.get(notification.id);
    if (existing) {
      return { created: false, notification: { ...existing } };
    }
    const record: StoredNotification = {
      id: notification.id,
      type: notification.type,
      createdAt: notification.createdAt ?? new Date().toISOString(),
      readAt: null,
      emailedAt: null,
      titleKey: notification.titleKey,
      bodyKey: notification.bodyKey,
      params: { ...notification.params },
      link: notification.link,
    };
    forUser.set(record.id, record);
    this.notifications.set(uid, forUser);
    return { created: true, notification: { ...record } };
  }

  async listNotifications(uid: string, opts?: { limit?: number }): Promise<StoredNotification[]> {
    const forUser = this.notifications.get(uid);
    if (!forUser) return [];
    const sorted = Array.from(forUser.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limited = opts?.limit ? sorted.slice(0, opts.limit) : sorted;
    return limited.map((n) => ({ ...n }));
  }

  async markNotificationsRead(uid: string, ids: string[] | 'all'): Promise<void> {
    const forUser = this.notifications.get(uid);
    if (!forUser) return;
    const now = new Date().toISOString();
    const targets = ids === 'all' ? Array.from(forUser.keys()) : ids;
    for (const id of targets) {
      const n = forUser.get(id);
      if (n && n.readAt === null) forUser.set(id, { ...n, readAt: now });
    }
  }

  async deleteNotifications(uid: string, ids: string[] | 'all'): Promise<void> {
    const forUser = this.notifications.get(uid);
    if (!forUser) return;
    if (ids === 'all') {
      forUser.clear();
      return;
    }
    for (const id of ids) forUser.delete(id);
  }

  async markNotificationEmailed(uid: string, id: string, at?: string): Promise<void> {
    const forUser = this.notifications.get(uid);
    const n = forUser?.get(id);
    if (n) forUser!.set(id, { ...n, emailedAt: at ?? new Date().toISOString() });
  }

  async savePushSubscription(uid: string, subscription: Omit<PushSubscriptionRecord, 'createdAt'>): Promise<void> {
    const forUser = this.pushSubs.get(uid) ?? new Map<string, PushSubscriptionRecord>();
    forUser.set(pushSubscriptionId(subscription.endpoint), {
      endpoint: subscription.endpoint,
      keys: { ...subscription.keys },
      createdAt: new Date().toISOString(),
    });
    this.pushSubs.set(uid, forUser);
  }

  async listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]> {
    const forUser = this.pushSubs.get(uid);
    return forUser ? Array.from(forUser.values()).map((s) => ({ ...s, keys: { ...s.keys } })) : [];
  }

  async deletePushSubscription(uid: string, endpoint: string): Promise<void> {
    this.pushSubs.get(uid)?.delete(pushSubscriptionId(endpoint));
  }
}

export class FirestoreNotificationsStore implements NotificationsStore {
  constructor(private db: Firestore) {}

  private notificationRef(uid: string, id: string) {
    return this.db.collection('users').doc(uid).collection('notifications').doc(id);
  }

  async createNotification(
    uid: string,
    notification: Omit<StoredNotification, 'readAt' | 'emailedAt'> & { createdAt?: string },
  ): Promise<{ created: boolean; notification: StoredNotification }> {
    const docRef = this.notificationRef(uid, notification.id);
    return await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (snap.exists) {
        return { created: false, notification: snap.data() as StoredNotification };
      }
      const record: StoredNotification = {
        id: notification.id,
        type: notification.type,
        createdAt: notification.createdAt ?? new Date().toISOString(),
        readAt: null,
        emailedAt: null,
        titleKey: notification.titleKey,
        bodyKey: notification.bodyKey,
        params: notification.params,
        link: notification.link,
      };
      tx.set(docRef, record);
      return { created: true, notification: record };
    });
  }

  async listNotifications(uid: string, opts?: { limit?: number }): Promise<StoredNotification[]> {
    const query = this.db
      .collection('users')
      .doc(uid)
      .collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(opts?.limit ?? 20);
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as StoredNotification);
  }

  async markNotificationsRead(uid: string, ids: string[] | 'all'): Promise<void> {
    const now = new Date().toISOString();
    const col = this.db.collection('users').doc(uid).collection('notifications');
    if (ids === 'all') {
      const unread = await col.where('readAt', '==', null).get();
      const batch = this.db.batch();
      unread.docs.forEach((d) => batch.update(d.ref, { readAt: now }));
      await batch.commit();
      return;
    }
    const batch = this.db.batch();
    ids.forEach((id) => batch.set(col.doc(id), { readAt: now }, { merge: true }));
    await batch.commit();
  }

  async deleteNotifications(uid: string, ids: string[] | 'all'): Promise<void> {
    const col = this.db.collection('users').doc(uid).collection('notifications');
    if (ids === 'all') {
      const snap = await col.get();
      if (snap.empty) return;
      const batch = this.db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      return;
    }
    if (ids.length === 0) return;
    const batch = this.db.batch();
    ids.forEach((id) => batch.delete(col.doc(id)));
    await batch.commit();
  }

  async markNotificationEmailed(uid: string, id: string, at?: string): Promise<void> {
    await this.notificationRef(uid, id).set({ emailedAt: at ?? new Date().toISOString() }, { merge: true });
  }

  private pushSubRef(uid: string, endpoint: string) {
    return this.db.collection('users').doc(uid).collection('pushSubscriptions').doc(pushSubscriptionId(endpoint));
  }

  async savePushSubscription(uid: string, subscription: Omit<PushSubscriptionRecord, 'createdAt'>): Promise<void> {
    const record: PushSubscriptionRecord = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      createdAt: new Date().toISOString(),
    };
    await this.pushSubRef(uid, subscription.endpoint).set(record);
  }

  async listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]> {
    const snap = await this.db.collection('users').doc(uid).collection('pushSubscriptions').get();
    return snap.docs.map((d) => d.data() as PushSubscriptionRecord);
  }

  async deletePushSubscription(uid: string, endpoint: string): Promise<void> {
    await this.pushSubRef(uid, endpoint).delete();
  }
}
