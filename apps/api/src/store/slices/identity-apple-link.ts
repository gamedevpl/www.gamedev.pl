import type { Firestore } from '@google-cloud/firestore';
import type { User } from '../records/identity.js';

export interface AppleLinkStore {
  // Null on 0 or 2+ matches, like findUserByEmail.
  findUserByAppleSub(sub: string): Promise<User | null>;

  // No-op when the account is gone.
  setAppleSub(uid: string, sub: string): Promise<void>;
}

export function findUserByAppleSubInMemory(users: Map<string, User>, sub: string): User | null {
  if (sub === '') return null;
  const matches = [...users.values()].filter((user) => user.appleSub === sub);
  return matches.length === 1 ? { ...(matches[0] as User) } : null;
}

export function setAppleSubInMemory(users: Map<string, User>, uid: string, sub: string): void {
  const existing = users.get(uid);
  if (existing) users.set(uid, { ...existing, appleSub: sub });
}

export async function findUserByAppleSubFirestore(db: Firestore, sub: string): Promise<User | null> {
  if (sub === '') return null;
  // limit(2) detects an ambiguous binding rather than picking the first one.
  const snap = await db.collection('users').where('appleSub', '==', sub).limit(2).get();
  return snap.size === 1 ? (snap.docs[0]?.data() as User) : null;
}

export async function setAppleSubFirestore(db: Firestore, uid: string, sub: string): Promise<void> {
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (snap.exists) transaction.set(ref, { appleSub: sub }, { merge: true });
  });
}
