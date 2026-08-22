/**
 * Drop keys whose value is `undefined` before a Firestore write.
 *
 * Firestore rejects `undefined` outright ("Cannot use 'undefined' as a Firestore
 * value") rather than treating it as an absent field, which collides head-on with the
 * TypeScript optional fields (`email?`, `name?`, `picture?`, `locale?`) that this
 * codebase builds records from. The mismatch is invisible in tests because
 * `InMemoryStore` stores whatever it is handed, so it only ever surfaces as a 500 in
 * production — which is exactly how it surfaced: the first `bot:` account (no email, no
 * picture) could not be created, and the waitlist has the same latent fault for anyone
 * whose Google email is unverified, since `auth.ts` deliberately passes `undefined`
 * there rather than store an unverified claim.
 *
 * Applied at the write boundary rather than at each call site so a record can be built
 * naturally, with optional fields left off.
 */
export function stripUndefined<T extends object>(value: T): T {
  // `T extends object`, not `Record<string, unknown>`: interfaces (`User`,
  // `WaitlistEntry`) have no implicit index signature, so the stricter bound rejects
  // every real caller.
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
