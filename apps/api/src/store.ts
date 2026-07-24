import { createHash } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import type { SubmissionStatus } from './submission-status.js';

export interface User {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  createdAt: string;
  lastLoginAt: string;
  tier: 'standard' | 'trusted' | 'blocked';
  /** Preferred locale for outbound email (defaults to 'en' when unset). */
  locale?: string;
  /** Global one-click email kill switch — set by the unsubscribe endpoint. */
  emailUnsubscribedAt?: string | null;
}

export interface SubmissionRecord {
  issueNumber: number;
  ownerUid: string;
  createdAt: string;
  title: string;
  /**
   * The status we last emitted a notification for. Drives transition detection
   * (only notify when the mapped event changes) and lets the sweep stop scanning
   * a submission once it reaches a terminal, already-notified state.
   */
  lastNotifiedStatus?: SubmissionStatus;
}

export interface UsageCounters {
  submissions: number;
  previews: number;
  mocks: number;
  refines: number;
  feedback: number;
}

// Transactional creator events (docs/notifications-plan.md). Deliberately minimal —
// queued/in_review are not notified. New types must pass the "would the user thank
// us?" test before being added.
export type NotificationType = 'submission.building' | 'submission.published' | 'submission.needs_changes';

export interface StoredNotification {
  /** Deterministic id (e.g. `sub-142-published`) so emission is idempotent. */
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  /** Set once a notification email has been sent, so retries don't re-send. */
  emailedAt: string | null;
  /**
   * i18n key + params rather than rendered text, so a language switch re-renders
   * old notifications correctly. The client calls t(titleKey, params).
   */
  titleKey: string;
  bodyKey: string;
  params: Record<string, string>;
  /** In-app destination, e.g. `#/status/<token>` or `#/play/<slug>`. */
  link: string;
}

// A browser Web Push subscription (docs/notifications-plan.md M2), stored verbatim
// as the client serialized it. Keyed by a hash of the endpoint so re-subscribing
// the same browser overwrites rather than duplicates.
export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}

export type WaitlistStatus = 'pending' | 'approved' | 'rejected';

export interface WaitlistEntry {
  uid: string;
  email?: string;
  name?: string;
  requestedAt: string;
  locale?: string;
  status: WaitlistStatus;
}

export interface Store {
  getUser(uid: string): Promise<User | null>;
  upsertUser(userData: Partial<User> & { uid: string }): Promise<User>;
  /** Set (or clear, with null) the global email-unsubscribe timestamp for a user. */
  setEmailUnsubscribed(uid: string, at: string | null): Promise<void>;
  createSubmission(issueNumber: number, ownerUid: string, title: string): Promise<SubmissionRecord>;
  getSubmission(issueNumber: number): Promise<SubmissionRecord | null>;
  setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void>;
  /**
   * Submissions the sweep should still check: those not yet in a terminal,
   * already-notified state (published / needs_changes recorded as last-notified).
   */
  listActiveSubmissions(): Promise<SubmissionRecord[]>;
  checkAndIncrementQuota(
    uid: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number; tier: User['tier'] }>;
  upsertWaitlistEntry(entry: { uid: string; email?: string; name?: string; locale?: string }): Promise<WaitlistEntry>;
  getWaitlistEntry(uid: string): Promise<WaitlistEntry | null>;
  isWaitlistApproved(uid: string, email?: string): Promise<boolean>;
  setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null>;
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
  /** Stamp emailedAt after a successful send so retries don't re-send. */
  markNotificationEmailed(uid: string, id: string, at?: string): Promise<void>;
  /** Upsert a browser push subscription (idempotent by endpoint). */
  savePushSubscription(uid: string, subscription: Omit<PushSubscriptionRecord, 'createdAt'>): Promise<void>;
  /** All push subscriptions for a user — the push fan-out sends to each. */
  listPushSubscriptions(uid: string): Promise<PushSubscriptionRecord[]>;
  /** Remove a subscription (client unsubscribe, or pruning a dead endpoint). */
  deletePushSubscription(uid: string, endpoint: string): Promise<void>;
}

// Stable doc id for a subscription: a hash of its endpoint URL. Endpoints are long
// and contain characters illegal in Firestore doc ids, and hashing gives idempotent
// re-subscribes for free.
export function pushSubscriptionId(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

export class InMemoryStore implements Store {
  private users = new Map<string, User>();
  private submissions = new Map<number, SubmissionRecord>();
  private usage = new Map<string, UsageCounters>();
  private waitlist = new Map<string, WaitlistEntry>();
  // uid -> (notificationId -> notification)
  private notifications = new Map<string, Map<string, StoredNotification>>();
  // uid -> (endpoint-hash -> subscription)
  private pushSubs = new Map<string, Map<string, PushSubscriptionRecord>>();

  async getUser(uid: string): Promise<User | null> {
    const user = this.users.get(uid);
    return user ? { ...user } : null;
  }

  async upsertUser(userData: Partial<User> & { uid: string }): Promise<User> {
    const now = new Date().toISOString();
    const existing = this.users.get(userData.uid);

    const updated: User = {
      uid: userData.uid,
      email: userData.email ?? existing?.email,
      name: userData.name ?? existing?.name,
      picture: userData.picture ?? existing?.picture,
      createdAt: existing?.createdAt ?? now,
      lastLoginAt: now,
      tier: userData.tier ?? existing?.tier ?? 'standard',
      // Preserve email prefs across logins — a re-login must not resubscribe.
      locale: userData.locale ?? existing?.locale,
      emailUnsubscribedAt: existing?.emailUnsubscribedAt ?? null,
    };

    this.users.set(userData.uid, updated);
    return { ...updated };
  }

  async setEmailUnsubscribed(uid: string, at: string | null): Promise<void> {
    const existing = this.users.get(uid);
    if (existing) this.users.set(uid, { ...existing, emailUnsubscribedAt: at });
  }

  async createSubmission(issueNumber: number, ownerUid: string, title: string): Promise<SubmissionRecord> {
    const record: SubmissionRecord = {
      issueNumber,
      ownerUid,
      createdAt: new Date().toISOString(),
      title,
    };
    this.submissions.set(issueNumber, record);
    return { ...record };
  }

  async getSubmission(issueNumber: number): Promise<SubmissionRecord | null> {
    const sub = this.submissions.get(issueNumber);
    return sub ? { ...sub } : null;
  }

  async setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, lastNotifiedStatus: status });
  }

  async listActiveSubmissions(): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => s.lastNotifiedStatus !== 'published' && s.lastNotifiedStatus !== 'needs_changes')
      .map((s) => ({ ...s }));
  }

  async checkAndIncrementQuota(
    uid: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number; tier: User['tier'] }> {
    const user = await this.getUser(uid);
    const tier = user?.tier ?? 'standard';

    if (tier === 'blocked') {
      return { allowed: false, current: Infinity, tier };
    }

    if (tier === 'trusted') {
      return { allowed: true, current: 0, tier };
    }

    const key = `${uid}:${dateStr}`;
    const currentCounters: UsageCounters = this.usage.get(key) ?? {
      submissions: 0,
      previews: 0,
      mocks: 0,
      refines: 0,
      feedback: 0,
    };
    const currentVal = currentCounters[action] ?? 0;

    if (currentVal >= limit) {
      return { allowed: false, current: currentVal, tier };
    }

    const newCounters: UsageCounters = {
      ...currentCounters,
      [action]: currentVal + 1,
    };
    this.usage.set(key, newCounters);

    return { allowed: true, current: newCounters[action], tier };
  }

  async upsertWaitlistEntry(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    const now = new Date().toISOString();
    const existing = this.waitlist.get(entry.uid);

    const updated: WaitlistEntry = {
      uid: entry.uid,
      email: entry.email ?? existing?.email,
      name: entry.name ?? existing?.name,
      requestedAt: now,
      locale: entry.locale ?? existing?.locale,
      status: existing?.status ?? 'pending',
    };

    this.waitlist.set(entry.uid, updated);
    return { ...updated };
  }

  async getWaitlistEntry(uid: string): Promise<WaitlistEntry | null> {
    const entry = this.waitlist.get(uid);
    return entry ? { ...entry } : null;
  }

  async isWaitlistApproved(uid: string, email?: string): Promise<boolean> {
    const byUid = this.waitlist.get(uid);
    if (byUid?.status === 'approved') return true;
    if (email) {
      const emailLower = email.toLowerCase();
      for (const entry of this.waitlist.values()) {
        if (entry.email?.toLowerCase() === emailLower && entry.status === 'approved') {
          return true;
        }
      }
    }
    return false;
  }

  async setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null> {
    const existing = this.waitlist.get(uid);
    if (!existing) return null;
    const updated: WaitlistEntry = { ...existing, status };
    this.waitlist.set(uid, updated);
    return { ...updated };
  }

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

  // Test/inspection only — not part of the Store interface. Production code never
  // reads the waitlist back (v1 promotion is manual, via the Firestore console).
  waitlistEntries(): WaitlistEntry[] {
    return Array.from(this.waitlist.values());
  }
}

export class FirestoreStore implements Store {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? new Firestore();
  }

  async getUser(uid: string): Promise<User | null> {
    const docRef = this.db.collection('users').doc(uid);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    return snap.data() as User;
  }

  async upsertUser(userData: Partial<User> & { uid: string }): Promise<User> {
    const now = new Date().toISOString();
    const docRef = this.db.collection('users').doc(userData.uid);

    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      let user: User;

      if (!snap.exists) {
        user = {
          uid: userData.uid,
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
          createdAt: now,
          lastLoginAt: now,
          tier: userData.tier ?? 'standard',
        };
      } else {
        const existing = snap.data() as User;
        user = {
          ...existing,
          email: userData.email ?? existing.email,
          name: userData.name ?? existing.name,
          picture: userData.picture ?? existing.picture,
          lastLoginAt: now,
          tier: userData.tier ?? existing.tier,
        };
      }

      transaction.set(docRef, user, { merge: true });
      return user;
    });
  }

  async setEmailUnsubscribed(uid: string, at: string | null): Promise<void> {
    await this.db.collection('users').doc(uid).set({ emailUnsubscribedAt: at }, { merge: true });
  }

  async createSubmission(issueNumber: number, ownerUid: string, title: string): Promise<SubmissionRecord> {
    const record: SubmissionRecord = {
      issueNumber,
      ownerUid,
      createdAt: new Date().toISOString(),
      title,
    };
    await this.db.collection('submissions').doc(String(issueNumber)).set(record);
    return record;
  }

  async getSubmission(issueNumber: number): Promise<SubmissionRecord | null> {
    const snap = await this.db.collection('submissions').doc(String(issueNumber)).get();
    if (!snap.exists) return null;
    return snap.data() as SubmissionRecord;
  }

  async setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    await this.db
      .collection('submissions')
      .doc(String(issueNumber))
      .set({ lastNotifiedStatus: status }, { merge: true });
  }

  async listActiveSubmissions(): Promise<SubmissionRecord[]> {
    // 'in' with the non-terminal set would need a composite index and misses docs
    // with no lastNotifiedStatus yet; filtering client-side is simpler and the
    // active set is small (open submissions only).
    const snap = await this.db.collection('submissions').get();
    return snap.docs
      .map((d) => d.data() as SubmissionRecord)
      .filter((s) => s.lastNotifiedStatus !== 'published' && s.lastNotifiedStatus !== 'needs_changes');
  }

  async checkAndIncrementQuota(
    uid: string,
    dateStr: string,
    limit: number,
    action: keyof UsageCounters,
  ): Promise<{ allowed: boolean; current: number; tier: User['tier'] }> {
    const userRef = this.db.collection('users').doc(uid);
    const counterRef = this.db.collection('usage').doc(uid).collection('counters').doc(dateStr);

    return await this.db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const user = userSnap.exists ? (userSnap.data() as User) : null;
      const tier = user?.tier ?? 'standard';

      if (tier === 'blocked') {
        return { allowed: false, current: Infinity, tier };
      }

      if (tier === 'trusted') {
        return { allowed: true, current: 0, tier };
      }

      const counterSnap = await transaction.get(counterRef);
      const data = counterSnap.exists ? counterSnap.data() : {};
      const currentVal = (data?.[action] as number) ?? 0;

      if (currentVal >= limit) {
        return { allowed: false, current: currentVal, tier };
      }

      const nextVal = currentVal + 1;
      transaction.set(counterRef, { [action]: nextVal }, { merge: true });

      return { allowed: true, current: nextVal, tier };
    });
  }

  async upsertWaitlistEntry(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    const now = new Date().toISOString();
    const docRef = this.db.collection('waitlist').doc(entry.uid);
    const snap = await docRef.get();
    const existing = snap.exists ? (snap.data() as WaitlistEntry) : null;

    const record: WaitlistEntry = {
      uid: entry.uid,
      email: entry.email,
      name: entry.name,
      requestedAt: now,
      locale: entry.locale,
      status: existing?.status ?? 'pending',
    };
    await docRef.set(record, { merge: true });
    return record;
  }

  async getWaitlistEntry(uid: string): Promise<WaitlistEntry | null> {
    const snap = await this.db.collection('waitlist').doc(uid).get();
    if (!snap.exists) return null;
    return snap.data() as WaitlistEntry;
  }

  async isWaitlistApproved(uid: string, email?: string): Promise<boolean> {
    const uidSnap = await this.db.collection('waitlist').doc(uid).get();
    if (uidSnap.exists && (uidSnap.data() as WaitlistEntry).status === 'approved') {
      return true;
    }
    if (email) {
      const emailLower = email.toLowerCase();
      const emailQuery = await this.db
        .collection('waitlist')
        .where('email', '==', emailLower)
        .where('status', '==', 'approved')
        .limit(1)
        .get();
      if (!emailQuery.empty) return true;
    }
    return false;
  }

  async setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null> {
    const docRef = this.db.collection('waitlist').doc(uid);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    await docRef.update({ status });
    const updatedSnap = await docRef.get();
    return updatedSnap.data() as WaitlistEntry;
  }

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
