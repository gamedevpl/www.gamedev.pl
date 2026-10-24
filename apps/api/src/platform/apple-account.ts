import { appleUid, type AppleAuthPayload } from './apple-auth.js';
import type { Store, User } from './store.js';

/**
 * Which account a Sign in with Apple identity belongs to.
 *
 * The problem this exists to solve: the beta's creators all signed in with Google, so
 * their games hang off a `g:<sub>` uid. Give them an Apple button that mints a fresh
 * `a:<sub>` uid and the first one to tap it lands in an empty account — no games, no
 * quota history, no submissions — and reasonably concludes the platform lost their work.
 * Nothing about that is recoverable by the creator, and support for it is a manual
 * Firestore edit.
 *
 * Email alone is not proof, so only a signed-in link (`/api/auth/apple/link`) joins them.
 */

export interface AppleAccountResolution {
  /** The uid to sign in as. */
  uid: string;
  // An account of another provider that linked this Apple ID.
  linkedTo?: User;
  // Another account holds this address; refuse sign-in and ask for a link.
  linkRequired?: true;
  // Non-relay address for account matching and the private-beta allowlist.
  email?: string;
}

// Relay aliases receive mail even though they cannot match other identities.
export function verifiedAppleContactEmail(payload: AppleAuthPayload): string | undefined {
  return payload.emailVerified ? payload.email?.trim() || undefined : undefined;
}

// Matching other identities and bootstrap allowlists excludes relay aliases.
export function linkableAppleEmail(payload: AppleAuthPayload): string | undefined {
  if (payload.isPrivateEmail) return undefined;
  const email = verifiedAppleContactEmail(payload);
  if (!email) return undefined;
  // The domain also detects relay aliases when Apple's flag is missing.
  if (email.toLowerCase().endsWith('@privaterelay.appleid.com')) return undefined;
  return email;
}

export async function resolveAppleAccount(
  store: Pick<Store, 'getUser' | 'findUserByEmail' | 'findUserByAppleSub'>,
  payload: AppleAuthPayload,
): Promise<AppleAccountResolution> {
  const own = appleUid(payload.sub);
  const email = linkableAppleEmail(payload);

  // Only a binding the account made itself moves Apple off its uid.
  const bound = await store.findUserByAppleSub(payload.sub);
  if (bound) return bound.uid === own ? { uid: own, email } : { uid: bound.uid, linkedTo: bound, email };

  // An account already standing at this uid IS this person's account.
  const existing = await store.getUser(own);
  if (existing) return { uid: own, email };

  if (email) {
    const match = await store.findUserByEmail(email);
    if (match && match.uid !== own) return { uid: own, email, linkRequired: true };
  }

  return { uid: own, email };
}

// The token's verified address must equal the account's own.
export async function appleLinkRefusal(
  store: Pick<Store, 'getUser' | 'findUserByAppleSub'>,
  account: User,
  payload: AppleAuthPayload,
): Promise<'already_linked' | 'linked_elsewhere' | 'has_own_account' | 'email_mismatch' | null> {
  const bound = await store.findUserByAppleSub(payload.sub);
  if (bound) return bound.uid === account.uid ? 'already_linked' : 'linked_elsewhere';
  if (await store.getUser(appleUid(payload.sub))) return 'has_own_account';
  const email = linkableAppleEmail(payload)?.toLowerCase();
  const accountEmail = account.email?.trim().toLowerCase();
  if (!email || !accountEmail || email !== accountEmail) return 'email_mismatch';
  return null;
}
