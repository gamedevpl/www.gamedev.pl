import type { Firestore } from '@google-cloud/firestore';
import type { User } from '../records/identity.js';

export interface AppleLinkStore {
  // Null on 0 or 2+ matches, like findUserByEmail.
  findUserByAppleSub(sub: string): Promise<User | null>;

  // False when another account holds it; no-op without the account.
  setAppleSub(uid: string, sub: string): Promise<boolean>;
}

export function findUserByAppleSubInMemory(users: Map<string, User>, sub: string): User | null {
  if (sub === '') return null;
  const matches = [...users.values()].filter((user) => user.appleSub === sub);
  return matches.length === 1 ? { ...(matches[0] as User) } : null;
}

export function setAppleSubInMemory(users: Map<string, User>, uid: string, sub: string): boolean {
  if ([...users.values()].some((user) => user.uid !== uid && user.appleSub === sub)) return false;
  const existing = users.get(uid);
  if (existing) users.set(uid, { ...existing, appleSub: sub });
  return true;
}

export async function findUserByAppleSubFirestore(db: Firestore, sub: string): Promise<User | null> {
  if (sub === '') return null;
  // limit(2) detects an ambiguous binding rather than picking the first one.
  const snap = await db.collection('users').where('appleSub', '==', sub).limit(2).get();
  return snap.size === 1 ? (snap.docs[0]?.data() as User) : null;
}

// `appleLinks/{sub}` locks uniqueness; the user field is the truth.
export async function setAppleSubFirestore(db: Firestore, uid: string, sub: string): Promise<boolean> {
  const userRef = db.collection('users').doc(uid);
  const lockRef = db.collection('appleLinks').doc(sub);
  return db.runTransaction(async (transaction) => {
    const [userSnap, lockSnap] = await Promise.all([transaction.get(userRef), transaction.get(lockRef)]);
    const holder = lockSnap.exists ? (lockSnap.data() as { uid?: string }).uid : undefined;
    if (holder && holder !== uid) {
      // A lock left by an erased or relinked account is free.
      const holderSnap = await transaction.get(db.collection('users').doc(holder));
      if ((holderSnap.data() as User | undefined)?.appleSub === sub) return false;
    }
    if (!userSnap.exists) return true;
    transaction.set(lockRef, { uid });
    transaction.set(userRef, { appleSub: sub }, { merge: true });
    return true;
  });
}
