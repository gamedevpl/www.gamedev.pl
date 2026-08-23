import type { Store, UsageCounters, User } from './platform/store.js';

/**
 * Read-only "is there budget left?" check, run *before* a paid Vertex call.
 *
 * The daily quota is what bounds what a creator can cost us, but it only bounds
 * spend if it is consulted before the money is spent. Both LLM-backed creation
 * routes used to moderate first and check quota second, so an account sitting at
 * its daily limit still paid for a Gemini moderation call on every request and
 * only then got its 429 — the quota was a gate on *outcomes*, not on cost.
 *
 * This exists rather than reordering around `checkAndIncrementQuota` because the
 * increment must stay after moderation: content rejected by the safety layer
 * deliberately costs the creator nothing (see the moderation-before-quota note at
 * each call site, and docs/content-safety-plan.md). Peeking is what lets both
 * things be true — a rejected prompt still spends no quota, and an exhausted
 * account still spends no money.
 *
 * Deliberately *not* authoritative: `checkAndIncrementQuota` remains the only
 * thing that decides and records a spend, inside a transaction. Two requests can
 * race past this peek, and that is fine — they meet the real gate a moment later.
 * The worst case is the pre-existing one (a couple of extra calls), not a bypass.
 */
export async function peekQuota(
  store: Store,
  uid: string,
  dateStr: string,
  limit: number,
  action: keyof UsageCounters,
): Promise<{ allowed: boolean; tier: User['tier'] }> {
  const [user, usage] = await Promise.all([store.getUser(uid), store.getUsage(uid, dateStr)]);
  const tier = user?.tier ?? 'standard';

  // Mirrors checkAndIncrementQuota's tier handling exactly; the two must not drift,
  // or this refuses callers the real gate would have admitted.
  if (tier === 'blocked') return { allowed: false, tier };
  if (tier === 'trusted') return { allowed: true, tier };

  return { allowed: (usage[action] ?? 0) < limit, tier };
}
