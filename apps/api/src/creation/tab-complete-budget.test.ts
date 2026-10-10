import { expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { completeWithBudget } from './tab-complete-budget.js';

it('attributes actual local tokens separately without passing source, paths or account identity to the recorder', async () => {
  const store = new InMemoryStore();
  const usage = vi.fn();
  const options = {
    store,
    dailyTabCompleteQuota: 1,
    tabCompleter: {
      complete: async () => ({ completion: 'code', model: 'test-model', tokens: { input: 20, output: 5 } }),
    },
  };
  const input = { path: 'private.ts', prefixWindow: 'private prefix', suffixWindow: '' };
  expect((await completeWithBudget(options, 'g:private', input, vi.fn(), undefined, usage)).status).toBe(200);
  expect(usage).toHaveBeenCalledExactlyOnceWith({ model: 'test-model', inputTokens: 20, outputTokens: 5 });
  expect((await completeWithBudget(options, 'g:private', input, vi.fn(), undefined, usage)).status).toBe(429);
  expect(usage).toHaveBeenCalledTimes(1);
});
