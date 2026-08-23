import { FieldValue, type Firestore } from '@google-cloud/firestore';
import type { AvatarMode } from '../../creator-profile.js';
import { stripUndefined } from '../firestore-util.js';
import type { User, HandleRecord, ClaimHandleResult } from '../records/identity.js';
import { claimHandleInMemory, claimHandleFirestore } from './identity-claim-handle.js';

export interface IdentityStore {
  getUser(uid: string): Promise<User | null>;

  // Case-insensitive handle lookup.
  getUserByHandle(handle: string): Promise<User | null>;

  // Includes cooldown-released rows; getUserByHandle hides those.
  getHandleReservation(handle: string): Promise<HandleRecord | null>;

  // Transactional against handles so two creators can't collide.
  claimHandle(uid: string, handle: string, at: string): Promise<ClaimHandleResult>;

  // Updates profileName / bio / avatarMode only; handle unchanged.
  updateCreatorProfile(
    uid: string,
    patch: { profileName?: string; bio?: string; avatarMode?: AvatarMode },
  ): Promise<User | null>;

  // Drops all handle reservations + profile fields (erasure path).
  releaseCreatorHandles(uid: string, at: string): Promise<string[]>;

  // Marks an account for later erasure; deletes nothing yet.
  scheduleAccountDeletion(uid: string, requestedAt: string, scheduledFor: string): Promise<User | null>;

  // Removes a pending deletion marker (e.g. person re-signs in).
  cancelAccountDeletion(uid: string): Promise<boolean>;

  // Accounts whose recovery window elapsed, oldest deadline first.
  listAccountsDueForDeletion(at: string, limit: number): Promise<User[]>;

  // Null on 0 or 2+ matches -- never signs into the wrong account.
  findUserByEmail(email: string): Promise<User | null>;

  upsertUser(userData: Partial<User> & { uid: string }): Promise<User>;

  // Sets/clears the global email-unsubscribe timestamp (null clears).
  setEmailUnsubscribed(uid: string, at: string | null): Promise<void>;

  // Sets/clears the weekly-digest opt-out timestamp (null clears).
  setDigestOptOut(uid: string, at: string | null): Promise<void>;
}

export class InMemoryIdentityStore implements IdentityStore {
  // Not private -- deleteAccountIdentity reaches across these (documented exception, see PR).
  users = new Map<string, User>();
  handles = new Map<string, HandleRecord>();

  async getUser(uid: string): Promise<User | null> {
    const user = this.users.get(uid);
    return user ? { ...user } : null;
  }

  async getUserByHandle(handle: string): Promise<User | null> {
    const key = handle.trim().toLowerCase();
    const reservation = this.handles.get(key);
    if (!reservation || reservation.releasedAt) return null;
    return this.getUser(reservation.uid);
  }

  async getHandleReservation(handle: string): Promise<HandleRecord | null> {
    const key = handle.trim().toLowerCase();
    const reservation = this.handles.get(key);
    return reservation ? { ...reservation } : null;
  }

  async claimHandle(uid: string, handle: string, at: string): Promise<ClaimHandleResult> {
    return claimHandleInMemory(this.users, this.handles, uid, handle, at);
  }

  async updateCreatorProfile(
    uid: string,
    patch: { profileName?: string; bio?: string; avatarMode?: AvatarMode },
  ): Promise<User | null> {
    const user = this.users.get(uid);
    if (!user) return null;
    const updated: User = {
      ...user,
      ...(patch.profileName !== undefined ? { profileName: patch.profileName } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.avatarMode !== undefined ? { avatarMode: patch.avatarMode } : {}),
    };
    this.users.set(uid, updated);
    return { ...updated };
  }

  async releaseCreatorHandles(uid: string, at: string): Promise<string[]> {
    const released: string[] = [];
    for (const [key, reservation] of [...this.handles.entries()]) {
      const owns =
        (!reservation.releasedAt && reservation.uid === uid) ||
        (Boolean(reservation.releasedAt) && reservation.previousUid === uid);
      if (!owns) continue;
      this.handles.delete(key);
      released.push(key);
    }
    const user = this.users.get(uid);
    if (user) {
      this.users.set(uid, {
        ...user,
        handle: undefined,
        profileName: undefined,
        bio: undefined,
        avatarMode: undefined,
        profileCreatedAt: undefined,
        handleChangedAt: undefined,
      });
    }
    void at;
    return released.sort();
  }

  async scheduleAccountDeletion(uid: string, requestedAt: string, scheduledFor: string): Promise<User | null> {
    const user = this.users.get(uid);
    if (!user) return null;
    const updated = { ...user, deletionRequestedAt: requestedAt, deletionScheduledFor: scheduledFor };
    this.users.set(uid, updated);
    return { ...updated };
  }

  async cancelAccountDeletion(uid: string): Promise<boolean> {
    const user = this.users.get(uid);
    if (!user?.deletionScheduledFor) return false;
    this.users.set(uid, { ...user, deletionRequestedAt: undefined, deletionScheduledFor: undefined });
    return true;
  }

  async listAccountsDueForDeletion(at: string, limit: number): Promise<User[]> {
    return [...this.users.values()]
      .filter((user) => user.deletionScheduledFor !== undefined && user.deletionScheduledFor <= at)
      .sort((left, right) => left.deletionScheduledFor!.localeCompare(right.deletionScheduledFor!))
      .slice(0, limit)
      .map((user) => ({ ...user }));
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const wanted = email.trim().toLowerCase();
    if (wanted === '') return null;
    const matches = [...this.users.values()].filter((user) => user.email?.trim().toLowerCase() === wanted);
    if (matches.length !== 1) return null;
    return { ...(matches[0] as User) };
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
      digestOptOutAt: existing?.digestOptOutAt ?? null,
      // Carried explicitly -- omitting it silently dropped every activity-hook write.
      activeDays: userData.activeDays ?? existing?.activeDays,
      // Profile fields are never set by sign-in, only claim/update routes.
      handle: existing?.handle,
      profileName: existing?.profileName,
      bio: existing?.bio,
      avatarMode: existing?.avatarMode,
      profileCreatedAt: existing?.profileCreatedAt,
      handleChangedAt: existing?.handleChangedAt,
      deletionRequestedAt: existing?.deletionRequestedAt,
      deletionScheduledFor: existing?.deletionScheduledFor,
    };

    this.users.set(userData.uid, updated);
    return { ...updated };
  }

  async setEmailUnsubscribed(uid: string, at: string | null): Promise<void> {
    const existing = this.users.get(uid);
    if (existing) this.users.set(uid, { ...existing, emailUnsubscribedAt: at });
  }

  async setDigestOptOut(uid: string, at: string | null): Promise<void> {
    const existing = this.users.get(uid);
    if (existing) this.users.set(uid, { ...existing, digestOptOutAt: at });
  }
}

export class FirestoreIdentityStore implements IdentityStore {
  constructor(private db: Firestore) {}

  async getUser(uid: string): Promise<User | null> {
    const docRef = this.db.collection('users').doc(uid);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    return snap.data() as User;
  }

  async getUserByHandle(handle: string): Promise<User | null> {
    const key = handle.trim().toLowerCase();
    if (!key) return null;
    const snap = await this.db.collection('handles').doc(key).get();
    if (!snap.exists) return null;
    const reservation = snap.data() as HandleRecord;
    if (reservation.releasedAt) return null;
    return this.getUser(reservation.uid);
  }

  async getHandleReservation(handle: string): Promise<HandleRecord | null> {
    const key = handle.trim().toLowerCase();
    if (!key) return null;
    const snap = await this.db.collection('handles').doc(key).get();
    if (!snap.exists) return null;
    return snap.data() as HandleRecord;
  }

  async claimHandle(uid: string, handle: string, at: string): Promise<ClaimHandleResult> {
    return claimHandleFirestore(this.db, uid, handle, at);
  }

  async updateCreatorProfile(
    uid: string,
    patch: { profileName?: string; bio?: string; avatarMode?: AvatarMode },
  ): Promise<User | null> {
    const user = await this.getUser(uid);
    if (!user) return null;
    const updated: User = {
      ...user,
      ...(patch.profileName !== undefined ? { profileName: patch.profileName } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.avatarMode !== undefined ? { avatarMode: patch.avatarMode } : {}),
    };
    await this.db.collection('users').doc(uid).set(stripUndefined(updated), { merge: true });
    return updated;
  }

  async releaseCreatorHandles(uid: string, at: string): Promise<string[]> {
    const released = new Set<string>();
    const user = await this.getUser(uid);
    if (user?.handle) released.add(user.handle);

    // Cooldown-held former handles still block claims; free those too.
    const previous = await this.db.collection('handles').where('previousUid', '==', uid).get();
    for (const doc of previous.docs) released.add(doc.id);
    const owned = await this.db.collection('handles').where('uid', '==', uid).get();
    for (const doc of owned.docs) released.add(doc.id);

    const batch = this.db.batch();
    for (const key of released) {
      batch.delete(this.db.collection('handles').doc(key));
    }
    if (user) {
      batch.set(
        this.db.collection('users').doc(uid),
        {
          handle: FieldValue.delete(),
          profileName: FieldValue.delete(),
          bio: FieldValue.delete(),
          avatarMode: FieldValue.delete(),
          profileCreatedAt: FieldValue.delete(),
          handleChangedAt: FieldValue.delete(),
        },
        { merge: true },
      );
    }
    if (released.size > 0 || user?.handle) {
      await batch.commit();
    }
    void at;
    return [...released].sort();
  }

  async scheduleAccountDeletion(uid: string, requestedAt: string, scheduledFor: string): Promise<User | null> {
    const ref = this.db.collection('users').doc(uid);
    return this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return null;
      const updated = {
        ...(snap.data() as User),
        deletionRequestedAt: requestedAt,
        deletionScheduledFor: scheduledFor,
      };
      transaction.set(ref, { deletionRequestedAt: requestedAt, deletionScheduledFor: scheduledFor }, { merge: true });
      return updated;
    });
  }

  async cancelAccountDeletion(uid: string): Promise<boolean> {
    const ref = this.db.collection('users').doc(uid);
    return this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists || !(snap.data() as User).deletionScheduledFor) return false;
      transaction.set(
        ref,
        { deletionRequestedAt: FieldValue.delete(), deletionScheduledFor: FieldValue.delete() },
        { merge: true },
      );
      return true;
    });
  }

  async listAccountsDueForDeletion(at: string, limit: number): Promise<User[]> {
    const snap = await this.db
      .collection('users')
      .where('deletionScheduledFor', '<=', at)
      .orderBy('deletionScheduledFor', 'asc')
      .limit(limit)
      .get();
    return snap.docs.map((doc) => doc.data() as User);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const trimmed = email.trim();
    if (trimmed === '') return null;

    // Collection-scoped equality; auto-indexed, checks both original and lowercased email.
    const lower = trimmed.toLowerCase();
    const candidates = [lower, ...(trimmed === lower ? [] : [trimmed])];

    for (const candidate of candidates) {
      // limit(2) detects an ambiguous match rather than picking the first one.
      const snap = await this.db.collection('users').where('email', '==', candidate).limit(2).get();
      if (snap.size === 1) return snap.docs[0]?.data() as User;
      if (snap.size > 1) return null;
    }

    return null;
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
          locale: userData.locale,
          activeDays: userData.activeDays,
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
          // existing was silently kept before -- dropping every incoming update.
          locale: userData.locale ?? existing.locale,
          activeDays: userData.activeDays ?? existing.activeDays,
        };
      }

      transaction.set(docRef, stripUndefined(user), { merge: true });
      return user;
    });
  }

  async setEmailUnsubscribed(uid: string, at: string | null): Promise<void> {
    await this.db.collection('users').doc(uid).set({ emailUnsubscribedAt: at }, { merge: true });
  }

  async setDigestOptOut(uid: string, at: string | null): Promise<void> {
    await this.db.collection('users').doc(uid).set({ digestOptOutAt: at }, { merge: true });
  }
}
