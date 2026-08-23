import { FieldValue, type Firestore } from '@google-cloud/firestore';
import type { AvatarMode } from '../../creator-profile.js';
import { stripUndefined } from '../firestore-util.js';
import type { User, HandleRecord, ClaimHandleResult } from '../records/identity.js';
import { claimHandleInMemory, claimHandleFirestore } from './identity-claim-handle.js';

export interface IdentityStore {
  getUser(uid: string): Promise<User | null>;

  /** Public profile lookup by unique handle (case-insensitive). */
  getUserByHandle(handle: string): Promise<User | null>;

  /**
   * Raw reservation row, including cooldown-held released handles. Availability checks
   * need this — `getUserByHandle` deliberately hides released rows.
   */
  getHandleReservation(handle: string): Promise<HandleRecord | null>;

  /**
   * Claim or rename a handle. Transactional against the `handles` reservation so two
   * creators cannot both win the same name.
   */
  claimHandle(uid: string, handle: string, at: string): Promise<ClaimHandleResult>;

  /** Update profileName / bio / avatarMode. Does not touch the handle. */
  updateCreatorProfile(
    uid: string,
    patch: { profileName?: string; bio?: string; avatarMode?: AvatarMode },
  ): Promise<User | null>;

  /**
   * Drop every handle reservation this uid holds (active or cooldown) and clear profile
   * fields on the user. Used by the account-erasure path so a deleted account cannot
   * keep a handle forever.
   */
  releaseCreatorHandles(uid: string, at: string): Promise<string[]>;

  /** Mark an account for later erasure without removing any data yet. */
  scheduleAccountDeletion(uid: string, requestedAt: string, scheduledFor: string): Promise<User | null>;

  /** Remove a pending deletion marker, normally when the person signs in again. */
  cancelAccountDeletion(uid: string): Promise<boolean>;

  /** Accounts whose recovery window has elapsed, oldest deadline first. */
  listAccountsDueForDeletion(at: string, limit: number): Promise<User[]>;

  /**
   * Find the single account holding this email, or null.
   *
   * Exists for one caller: linking a Sign in with Apple identity onto the Google account
   * the same person already has (`resolveAppleAccount` in `apple-account.ts`). Without it
   * a creator who taps the Apple button lands in an empty account and their games look
   * deleted.
   *
   * Returns null when *more than one* account matches, not an arbitrary one. An ambiguous
   * match means signing somebody into an account that may not be theirs; a null means
   * they get a fresh account, which is recoverable. Only ever called with an address the
   * identity provider says it verified — see the callers.
   */
  findUserByEmail(email: string): Promise<User | null>;

  upsertUser(userData: Partial<User> & { uid: string }): Promise<User>;

  /** Set (or clear, with null) the global email-unsubscribe timestamp for a user. */
  setEmailUnsubscribed(uid: string, at: string | null): Promise<void>;

  /** Set (or clear, with null) the weekly-digest opt-out for a user. */
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
      // Carried explicitly. Omitting it silently discarded every write from the
      // activity hook in `auth.ts`, whose only purpose is to persist this field.
      activeDays: userData.activeDays ?? existing?.activeDays,
      // Profile fields are never set by sign-in — only claim/update routes touch them.
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

    // Collection-scoped equality, so Firestore's automatic single-field index covers it
    // and nothing needs provisioning in setup-gcp.sh (see firestore-indexes.test.ts —
    // only collection *group* queries need a declared index).
    //
    // Two casings because `users.email` is stored exactly as the identity provider sent
    // it, with no normalization, for every account created before this method existed.
    // Google returns lowercase in practice, which is why the common case is one read.
    const lower = trimmed.toLowerCase();
    const candidates = [lower, ...(trimmed === lower ? [] : [trimmed])];

    for (const candidate of candidates) {
      // limit(2), not limit(1): the point is to *detect* an ambiguous match rather than
      // silently sign somebody into the first of several accounts sharing an address.
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
          // `...existing` carries the *stored* value, so an incoming update to either of
          // these was dropped on the floor for every account that already existed —
          // which, for `activeDays`, is every account the activity hook ever touched.
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
