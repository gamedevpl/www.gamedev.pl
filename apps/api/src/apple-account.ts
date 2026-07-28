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
 * So an Apple sign-in resolves onto an existing account when it can prove it is the same
 * person, and only then.
 */

export interface AppleAccountResolution {
  /** The uid to sign in as. */
  uid: string;
  /**
   * Set when `uid` is an account that already existed under a different identity
   * provider. Callers use it for logging; nothing branches on it.
   */
  linkedTo?: User;
  /**
   * The address safe to persist and to test against the private-beta allowlist, or
   * undefined when Apple gave us nothing usable. Never a relay address.
   */
  email?: string;
}

/**
 * The address an Apple payload may be matched or allowlisted on, if any.
 *
 * Two independent disqualifiers:
 *
 * - **Unverified.** Same rule the Google path applies: an unverified claim must never
 *   satisfy an access-control decision.
 * - **Private relay.** "Hide My Email" yields a verified, deliverable, genuinely-theirs
 *   `@privaterelay.appleid.com` address — but it is freshly minted per app and nobody
 *   else has ever seen it, so it cannot match an existing account or an allowlist a human
 *   typed. Matching on it would always miss; the danger is not a false link but a silent
 *   failure to link, which is why it is named here rather than left to chance.
 */
export function linkableAppleEmail(payload: AppleAuthPayload): string | undefined {
  if (!payload.emailVerified) return undefined;
  if (payload.isPrivateEmail) return undefined;
  const email = payload.email?.trim();
  if (!email) return undefined;
  // Belt and braces: Apple should always set `is_private_email` for these, but the claim
  // is one of the string-or-boolean ones and the domain is unambiguous on its own.
  if (email.toLowerCase().endsWith('@privaterelay.appleid.com')) return undefined;
  return email;
}

export async function resolveAppleAccount(
  store: Pick<Store, 'getUser' | 'findUserByEmail'>,
  payload: AppleAuthPayload,
): Promise<AppleAccountResolution> {
  const own = appleUid(payload.sub);
  const email = linkableAppleEmail(payload);

  // An account already standing at this uid IS this person's account, and it exists only
  // because a previous sign-in declined to link. Re-running the match now could move them
  // onto a different account between one sign-in and the next, so it is not attempted.
  const existing = await store.getUser(own);
  if (existing) return { uid: own, email };

  if (email) {
    const match = await store.findUserByEmail(email);
    // `findUserByEmail` returns null on an ambiguous match, so a linked result is always
    // exactly one account. Guarding the self-match too keeps this correct if the lookup
    // ever starts seeing the `a:` account itself.
    if (match && match.uid !== own) {
      return { uid: match.uid, linkedTo: match, email };
    }
  }

  return { uid: own, email };
}
