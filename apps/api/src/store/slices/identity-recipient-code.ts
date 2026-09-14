import type { Firestore } from '@google-cloud/firestore';
import { generateRecipientCode } from '../../platform/recipient-code.js';
import { stripUndefined } from '../firestore-util.js';
import type { User } from '../records/identity.js';

// A collision is astronomically unlikely; retry rather than steal a code.
const MAX_ATTEMPTS = 5;

export interface RecipientCodeRecord {
  uid: string;
  createdAt: string;
}

// Idempotent: returns the existing code, minted lazily rather than at sign-in.
export async function ensureRecipientCodeInMemory(
  users: Map<string, User>,
  codes: Map<string, RecipientCodeRecord>,
  uid: string,
  at: string,
  isErased: (uid: string) => boolean = () => false,
): Promise<string | null> {
  const user = users.get(uid);
  if (!user || isErased(uid)) return null;
  if (user.recipientCode) return user.recipientCode;
  return rotateRecipientCodeInMemory(users, codes, uid, at, isErased);
}

// Mints a fresh code and retires the old one.
export async function rotateRecipientCodeInMemory(
  users: Map<string, User>,
  codes: Map<string, RecipientCodeRecord>,
  uid: string,
  at: string,
  isErased: (uid: string) => boolean = () => false,
): Promise<string | null> {
  const user = users.get(uid);
  if (!user || isErased(uid)) return null;

  let code = generateRecipientCode();
  for (let attempt = 1; codes.has(code) && attempt < MAX_ATTEMPTS; attempt += 1) code = generateRecipientCode();
  if (codes.has(code)) throw new Error('recipient code generation exhausted retries');

  if (user.recipientCode) codes.delete(user.recipientCode);
  codes.set(code, { uid, createdAt: at });
  users.set(uid, { ...user, recipientCode: code });
  return code;
}

export function getUserByRecipientCodeInMemory(
  users: Map<string, User>,
  codes: Map<string, RecipientCodeRecord>,
  code: string,
): User | null {
  const record = codes.get(code);
  if (!record) return null;
  const user = users.get(record.uid);
  return user ? { ...user } : null;
}

// Checks for an existing code inside the transaction to avoid a clobber.
export async function ensureRecipientCodeFirestore(db: Firestore, uid: string, at: string): Promise<string | null> {
  const codes = db.collection('recipientCodes');
  const userRef = db.collection('users').doc(uid);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const candidate = generateRecipientCode();
    try {
      return await db.runTransaction(async (tx) => {
        const [userSnap, fenceSnap] = await Promise.all([
          tx.get(userRef),
          tx.get(db.collection('erasedAccounts').doc(uid)),
        ]);
        if (!userSnap.exists || fenceSnap.exists) return null;
        const existing = (userSnap.data() as User).recipientCode;
        if (existing) return existing;

        const codeSnap = await tx.get(codes.doc(candidate));
        if (codeSnap.exists) throw new Error('recipient code collision');
        tx.set(codes.doc(candidate), { uid, createdAt: at } satisfies RecipientCodeRecord);
        tx.set(userRef, stripUndefined({ recipientCode: candidate }), { merge: true });
        return candidate;
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('recipient code generation exhausted retries');
}

export async function rotateRecipientCodeFirestore(db: Firestore, uid: string, at: string): Promise<string | null> {
  const codes = db.collection('recipientCodes');
  const userRef = db.collection('users').doc(uid);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const code = generateRecipientCode();
    try {
      return await db.runTransaction(async (tx) => {
        // All reads before any write: Firestore transactions require that ordering.
        const [userSnap, codeSnap, fenceSnap] = await Promise.all([
          tx.get(userRef),
          tx.get(codes.doc(code)),
          tx.get(db.collection('erasedAccounts').doc(uid)),
        ]);
        if (!userSnap.exists || fenceSnap.exists) return null;
        if (codeSnap.exists) throw new Error('recipient code collision');
        const user = userSnap.data() as User;
        const oldRef = user.recipientCode ? codes.doc(user.recipientCode) : null;
        tx.set(codes.doc(code), { uid, createdAt: at } satisfies RecipientCodeRecord);
        if (oldRef) tx.delete(oldRef);
        tx.set(userRef, stripUndefined({ recipientCode: code }), { merge: true });
        return code;
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('recipient code generation exhausted retries');
}

export async function getUserByRecipientCodeFirestore(db: Firestore, code: string): Promise<User | null> {
  const snap = await db.collection('recipientCodes').doc(code).get();
  if (!snap.exists) return null;
  const { uid } = snap.data() as RecipientCodeRecord;
  const userSnap = await db.collection('users').doc(uid).get();
  return userSnap.exists ? (userSnap.data() as User) : null;
}
