import { describe, expect, it } from 'vitest';
import { SeedBudget, SEED_MAX_USD, SEED_TOTAL_OUTPUT_TOKENS } from './seed-budget.js';

const result = (outputTokens: number) => ({ parts: [], usage: { inputTokens: 20, outputTokens } });

describe('SeedBudget', () => {
  it('shares the output allowance across pick, generation and repair', async () => {
    const budget = new SeedBudget('claude-sonnet-5-5');
    const caps: number[] = [];
    for (const output of [100, 7000, 1000]) {
      await budget.call('model', 'prompt', 65_536, 1000, async (_signal, cap) => {
        caps.push(cap);
        return result(output);
      });
    }
    expect(caps).toEqual([8192, 8092, 1092]);
    expect(caps[2]).toBeLessThan(SEED_TOTAL_OUTPUT_TOKENS);
  });

  it('reserves input and output dollars before contacting the model', async () => {
    const budget = new SeedBudget('claude-sonnet-5-5');
    const prompt = 'x'.repeat(40_000);
    let cap = 0;
    await budget.call('generate', prompt, 65_536, 1000, async (_signal, tokens) => {
      cap = tokens;
      return result(tokens);
    });
    expect(((40_000 + 1024) * 2 + cap * 10) / 1e6).toBeLessThanOrEqual(SEED_MAX_USD);
    let called = false;
    await expect(
      budget.call('repair', prompt, 65_536, 1000, async () => {
        called = true;
        return result(1);
      }),
    ).rejects.toThrow('budget exhausted');
    expect(called).toBe(false);
  });

  it('refuses unpriced models before making a paid call', () => {
    expect(() => new SeedBudget('unknown-model')).toThrow('unpriced model');
  });

  it('returns at the shared deadline even if work ignores cancellation', async () => {
    const budget = new SeedBudget('claude-sonnet-5-5', undefined, 20);
    const ignored = new Promise<never>(() => {});
    await expect(budget.wait(ignored)).rejects.toBeDefined();
    expect(budget.signal.aborted).toBe(true);
    await expect(budget.call('repair', '', 1000, 1000, async () => result(1))).rejects.toBeDefined();
  });

  it('passes the shared cancellation to a hung paid request', async () => {
    const budget = new SeedBudget('claude-sonnet-5-5', undefined, 20);
    let requestSignal: AbortSignal | undefined;
    await expect(
      budget.call('generate', 'prompt', 8192, 600_000, async (signal) => {
        requestSignal = signal;
        return new Promise<never>(() => {});
      }),
    ).rejects.toBeDefined();
    expect(requestSignal?.aborted).toBe(true);
  });

  it('does not reset the shared deadline for repair', async () => {
    const budget = new SeedBudget('claude-sonnet-5-5', undefined, 20);
    await budget.call('generate', 'prompt', 1000, 1000, async () => result(1));
    await expect(
      budget.call('repair', 'prompt', 1000, 1000, async () => new Promise<never>(() => {})),
    ).rejects.toBeDefined();
    expect(budget.signal.aborted).toBe(true);
  });

  it('charges the reserved ceiling when output usage is unavailable', async () => {
    const budget = new SeedBudget('claude-sonnet-5-5');
    await budget.call('generate', 'prompt', 8192, 1000, async () => ({ parts: [] }));
    await expect(budget.call('repair', 'prompt', 8192, 1000, async () => result(1))).rejects.toThrow(
      'budget exhausted',
    );
  });

  it('does not refund a failed paid call without usage', async () => {
    const budget = new SeedBudget('claude-sonnet-5-5');
    await expect(
      budget.call('generate', 'prompt', 8192, 1000, async () => {
        throw new Error('connection lost');
      }),
    ).rejects.toThrow('connection lost');
    let called = false;
    await expect(
      budget.call('repair', 'prompt', 8192, 1000, async () => {
        called = true;
        return result(1);
      }),
    ).rejects.toThrow('budget exhausted');
    expect(called).toBe(false);
  });
});
