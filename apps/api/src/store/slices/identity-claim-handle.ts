import type { Firestore } from '@google-cloud/firestore';
import { stripUndefined } from '../firestore-util.js';
import type { User, HandleRecord, ClaimHandleResult } from '../records/identity.js';

// Transactional against handles so two creators can't collide.
export async function claimHandleInMemory(
  users: Map<string, User>,
  handles: Map<string, HandleRecord>,
  uid: string,
  handle: string,
  at: string,
): Promise<ClaimHandleResult> {
  const { normalizeHandle, validateHandleShape, HANDLE_RENAME_COOLDOWN_MS } = await import('../../creator-profile.js');
  const key = normalizeHandle(handle);
  const shape = validateHandleShape(key);
  if (shape) return { ok: false, reason: shape };

  const user = users.get(uid);
  if (!user) return { ok: false, reason: 'not_found' };
  if (user.handle === key) return { ok: false, reason: 'unchanged' };

  if (user.handle && user.handleChangedAt) {
    const elapsed = Date.parse(at) - Date.parse(user.handleChangedAt);
    if (Number.isFinite(elapsed) && elapsed < HANDLE_RENAME_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown' };
    }
  }

  const existing = handles.get(key);
  if (existing && !existing.releasedAt && existing.uid !== uid) {
    return { ok: false, reason: 'taken' };
  }
  if (existing?.releasedAt && existing.previousUid !== uid) {
    const elapsed = Date.parse(at) - Date.parse(existing.releasedAt);
    if (Number.isFinite(elapsed) && elapsed < HANDLE_RENAME_COOLDOWN_MS) {
      return { ok: false, reason: 'taken' };
    }
  }

  if (user.handle) {
    handles.set(user.handle, {
      uid: user.uid,
      claimedAt: user.profileCreatedAt ?? at,
      releasedAt: at,
      previousUid: user.uid,
    });
  }

  handles.set(key, { uid, claimedAt: user.profileCreatedAt ?? at });
  const updated: User = {
    ...user,
    handle: key,
    profileCreatedAt: user.profileCreatedAt ?? at,
    handleChangedAt: at,
    profileName: user.profileName ?? key,
    // Lettermark until the creator opts into showing their Google picture.
    avatarMode: user.avatarMode ?? 'letter',
  };
  users.set(uid, updated);
  return { ok: true, user: { ...updated } };
}

export async function claimHandleFirestore(
  db: Firestore,
  uid: string,
  handle: string,
  at: string,
): Promise<ClaimHandleResult> {
  const { normalizeHandle, validateHandleShape, HANDLE_RENAME_COOLDOWN_MS } = await import('../../creator-profile.js');
  const key = normalizeHandle(handle);
  const shape = validateHandleShape(key);
  if (shape) return { ok: false, reason: shape };

  const users = db.collection('users');
  const handles = db.collection('handles');

  try {
    return await db.runTransaction(async (tx) => {
      const userRef = users.doc(uid);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) return { ok: false, reason: 'not_found' };
      const user = userSnap.data() as User;
      if (user.handle === key) return { ok: false, reason: 'unchanged' };

      if (user.handle && user.handleChangedAt) {
        const elapsed = Date.parse(at) - Date.parse(user.handleChangedAt);
        if (Number.isFinite(elapsed) && elapsed < HANDLE_RENAME_COOLDOWN_MS) {
          return { ok: false, reason: 'cooldown' };
        }
      }

      const handleRef = handles.doc(key);
      const handleSnap = await tx.get(handleRef);
      if (handleSnap.exists) {
        const existing = handleSnap.data() as HandleRecord;
        if (!existing.releasedAt && existing.uid !== uid) {
          return { ok: false, reason: 'taken' };
        }
        if (existing.releasedAt && existing.previousUid !== uid) {
          const elapsed = Date.parse(at) - Date.parse(existing.releasedAt);
          if (Number.isFinite(elapsed) && elapsed < HANDLE_RENAME_COOLDOWN_MS) {
            return { ok: false, reason: 'taken' };
          }
        }
      }

      // Firestore requires every read before every write in a transaction.
      const oldHandleRef = user.handle && user.handle !== key ? handles.doc(user.handle) : null;
      if (oldHandleRef) await tx.get(oldHandleRef);

      if (oldHandleRef) {
        tx.set(oldHandleRef, {
          uid: user.uid,
          claimedAt: user.profileCreatedAt ?? at,
          releasedAt: at,
          previousUid: user.uid,
        } satisfies HandleRecord);
      }

      const updated: User = {
        ...user,
        handle: key,
        profileCreatedAt: user.profileCreatedAt ?? at,
        handleChangedAt: at,
        profileName: user.profileName ?? key,
        // Lettermark until the creator opts into showing their Google picture.
        avatarMode: user.avatarMode ?? 'letter',
      };
      tx.set(handleRef, { uid, claimedAt: updated.profileCreatedAt ?? at } satisfies HandleRecord);
      tx.set(userRef, stripUndefined(updated), { merge: true });
      return { ok: true, user: updated };
    });
  } catch (err) {
    console.error('claimHandle transaction failed', err);
    return { ok: false, reason: 'taken' };
  }
}
