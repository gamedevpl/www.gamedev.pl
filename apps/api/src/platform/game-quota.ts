import type { Store } from './store.js';
import type { UsageCounters } from '../store/records/quota.js';

export async function reserveActorAndGameQuota(
  store: Store,
  input: {
    actorUid: string;
    slug: string;
    dateStr: string;
    actorLimit: number;
    gameLimit: number;
    action: keyof UsageCounters;
  },
): Promise<{ allowed: boolean; reason: 'actor' | 'game' | null; current: number; tier: string }> {
  const user = await store.getUser(input.actorUid);
  const tier = user?.tier ?? 'standard';
  if (tier === 'blocked') return { allowed: false, reason: 'actor', current: Infinity, tier };
  if (tier !== 'trusted') {
    const usage = await store.getUsage(input.actorUid, input.dateStr);
    const current = usage[input.action] ?? 0;
    if (current >= input.actorLimit) {
      return { allowed: false, reason: 'actor', current, tier };
    }
  }
  const game = await store.checkAndIncrementGameQuota(input.slug, input.dateStr, input.gameLimit, input.action);
  if (!game.allowed) return { allowed: false, reason: 'game', current: game.current, tier };
  const actor = await store.checkAndIncrementQuota(input.actorUid, input.dateStr, input.actorLimit, input.action);
  if (!actor.allowed) {
    await store.decrementGameQuota(input.slug, input.dateStr, input.action);
    return { allowed: false, reason: 'actor', current: actor.current, tier: actor.tier };
  }
  return { allowed: true, reason: null, current: actor.current, tier: actor.tier };
}
