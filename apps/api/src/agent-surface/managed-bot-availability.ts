import type { Store } from '../platform/store.js';
import { resolveDefaultGlobalDailyBotCallCap } from '../platform/bot-allowance.js';
export async function botAllowanceAvailable(store: Store, date: string, spend: boolean): Promise<boolean> {
  const cap = resolveDefaultGlobalDailyBotCallCap();
  if (cap <= 0) return true;
  return spend
    ? (await store.checkAndIncrementGlobalBotCalls(date, cap)).allowed
    : (await store.getGlobalBotCallCount(date)) < cap;
}
