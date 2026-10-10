import type { Store } from '../platform/store.js';
import type { TabCompleteGate } from './creation-limits.js';
import type { TabCompleter, TabCompleteRequest } from './tab-complete.js';

export const DEFAULT_DAILY_TAB_COMPLETE_QUOTA = 2000;
export type CompletionBudgetOptions = {
  store: Store;
  tabCompleter?: TabCompleter;
  tabCompleteGate?: TabCompleteGate;
  dailyTabCompleteQuota?: number;
  now?: () => number;
};

export async function completeWithBudget(
  options: CompletionBudgetOptions,
  uid: string,
  input: TabCompleteRequest,
  warn: (error: unknown) => void,
  jobId?: number,
) {
  const nowMs = (options.now ?? Date.now)();
  const dateStr = new Date(nowMs).toISOString().slice(0, 10);
  let reserved = false;
  if (options.tabCompleteGate) {
    const gate = await options.tabCompleteGate.peek(uid, dateStr);
    if (!gate.allowed) return { status: 503, body: { error: 'completions are resting right now — try again later' } };
    reserved = gate.reserved;
  }
  const quota = await options.store.checkAndIncrementQuota(
    uid,
    dateStr,
    options.dailyTabCompleteQuota ?? Number(process.env.DAILY_TAB_COMPLETE_QUOTA ?? DEFAULT_DAILY_TAB_COMPLETE_QUOTA),
    'tabCompletes',
  );
  if (!quota.allowed) {
    await options.tabCompleteGate?.spend(uid, dateStr, 0, reserved);
    return { status: 429, body: { error: 'daily tab-complete quota exceeded' } };
  }
  let result;
  try {
    result = await options.tabCompleter!.complete(input);
  } catch (error) {
    warn(error);
    await options.tabCompleteGate?.spend(uid, dateStr, 0, reserved);
    return { status: 503, body: { error: 'no completion right now — try again' } };
  }
  const tokens = result.tokens;
  await options.tabCompleteGate?.spend(uid, dateStr, tokens ? tokens.input + tokens.output : 0, reserved);
  if (tokens && jobId !== undefined)
    await options.store
      .recordJobCost(jobId, {
        kind: 'tab_complete',
        at: new Date(nowMs).toISOString(),
        by: result.model ?? 'vertex',
        tokens,
      })
      .catch(() => {});
  return { status: 200, body: { completion: result.completion } };
}
