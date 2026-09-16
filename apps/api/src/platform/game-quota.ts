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
  const actor = await store.checkAndIncrementQuota(input.actorUid, input.dateStr, input.actorLimit, input.action);
  if (!actor.allowed) return { allowed: false, reason: 'actor', current: actor.current, tier: actor.tier };
  const game = await store.checkAndIncrementGameQuota(input.slug, input.dateStr, input.gameLimit, input.action);
  if (!game.allowed) return { allowed: false, reason: 'game', current: game.current, tier: actor.tier };
  return { allowed: true, reason: null, current: actor.current, tier: actor.tier };
}
