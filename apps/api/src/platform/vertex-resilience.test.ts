import { describe, expect, it } from 'vitest';
import { callWithVertexResilience, isRetryableVertexError } from './vertex-resilience.js';

const capacity = () => new Error('429 Resource exhausted');

describe('surviving a moment of no capacity', () => {
  it('returns the first answer without retrying', async () => {
    let attempts = 0;
    const value = await callWithVertexResilience({
      timeoutMs: 100,
      attempt: async () => {
        attempts += 1;
        return 'ok';
      },
    });

    expect(value).toBe('ok');
    expect(attempts).toBe(1);
  });

  it('retries the same model once before anything else', async () => {
    const models: (string | undefined)[] = [];
    const value = await callWithVertexResilience({
      timeoutMs: 200,
      retryDelayMs: 0,
      fallbackModel: 'stand-in',
      attempt: async (model) => {
        models.push(model);
        if (models.length === 1) throw capacity();
        return 'ok';
      },
    });

    expect(value).toBe('ok');
    expect(models).toEqual([undefined, undefined]);
  });

  it('reaches the stand-in only after the primary has had two goes', async () => {
    const models: (string | undefined)[] = [];
    await callWithVertexResilience({
      timeoutMs: 200,
      retryDelayMs: 0,
      fallbackModel: 'stand-in',
      attempt: async (model) => {
        models.push(model);
        if (model === undefined) throw capacity();
        return 'ok';
      },
    });

    expect(models).toEqual([undefined, undefined, 'stand-in']);
  });

  it('stops at the primary when no stand-in is configured', async () => {
    let attempts = 0;
    await expect(
      callWithVertexResilience({
        timeoutMs: 200,
        retryDelayMs: 0,
        attempt: async () => {
          attempts += 1;
          throw capacity();
        },
      }),
    ).rejects.toThrow(/429/);
    expect(attempts).toBe(2);
  });

  // Retrying these just repeats the same answer.
  it('does not retry a failure a retry cannot fix', async () => {
    let attempts = 0;
    await expect(
      callWithVertexResilience({
        timeoutMs: 200,
        retryDelayMs: 0,
        fallbackModel: 'stand-in',
        attempt: async () => {
          attempts += 1;
          throw new Error('Could not load the default credentials');
        },
      }),
    ).rejects.toThrow(/credentials/);
    expect(attempts).toBe(1);
  });

  it('hands each attempt a share of the budget, never more than remains', async () => {
    const budgets: number[] = [];
    await expect(
      callWithVertexResilience({
        timeoutMs: 300,
        retryDelayMs: 10,
        fallbackModel: 'stand-in',
        attempt: async (_model, timeoutMs) => {
          budgets.push(timeoutMs);
          await new Promise((resolve) => setTimeout(resolve, 40));
          throw capacity();
        },
      }),
    ).rejects.toThrow();

    expect(budgets).toHaveLength(3);
    expect(budgets.every((budget) => budget > 0 && budget < 300)).toBe(true);
  });

  it('stops attempting once the budget is spent', async () => {
    let attempts = 0;
    await expect(
      callWithVertexResilience({
        timeoutMs: 60,
        retryDelayMs: 0,
        fallbackModel: 'stand-in',
        attempt: async () => {
          attempts += 1;
          await new Promise((resolve) => setTimeout(resolve, 50));
          throw capacity();
        },
      }),
    ).rejects.toThrow();

    expect(attempts).toBeLessThan(3);
  });

  it('reports which failures are worth a second look', () => {
    expect(isRetryableVertexError(new Error('429 RESOURCE_EXHAUSTED'))).toBe(true);
    expect(isRetryableVertexError(new Error('503 UNAVAILABLE'))).toBe(true);
    expect(isRetryableVertexError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isRetryableVertexError(new Error('400 invalid argument'))).toBe(false);
  });
});

// A call past the deadline is billed against a spent budget.
describe('the budget after sleeping', () => {
  it('does not start an attempt the retry delay has outlived', async () => {
    const attempts: number[] = [];
    let clock = 0;
    await expect(
      callWithVertexResilience({
        timeoutMs: 30,
        retryDelayMs: 50,
        now: () => clock,
        sleepImpl: async (ms) => {
          clock += ms;
        },
        attempt: async (_model, timeoutMs) => {
          attempts.push(timeoutMs);
          clock += 5;
          throw new Error('429 Resource exhausted');
        },
      }),
    ).rejects.toThrow(/429/);

    // 60% without a stand-in; the retry delay outlives the rest.
    expect(attempts).toEqual([18]);
  });
});

// The stand-in exists for a primary that stalls to its deadline.
describe('leaving room for the stand-in', () => {
  it('reaches the fallback even when every primary attempt burns its whole share', async () => {
    const tried: (string | undefined)[] = [];
    let clock = 0;
    await callWithVertexResilience({
      timeoutMs: 1000,
      retryDelayMs: 0,
      fallbackModel: 'stand-in',
      now: () => clock,
      sleepImpl: async (ms) => {
        clock += ms;
      },
      attempt: async (model, timeoutMs) => {
        tried.push(model);
        clock += timeoutMs;
        if (model === undefined) throw Object.assign(new Error('stalled'), { name: 'AbortError' });
        return 'ok';
      },
    });

    expect(tried).toEqual([undefined, undefined, 'stand-in']);
  });

  it('never hands one attempt the whole budget when a stand-in is configured', async () => {
    const budgets: number[] = [];
    let clock = 0;
    await expect(
      callWithVertexResilience({
        timeoutMs: 1000,
        retryDelayMs: 0,
        fallbackModel: 'stand-in',
        now: () => clock,
        sleepImpl: async (ms) => {
          clock += ms;
        },
        attempt: async (_model, timeoutMs) => {
          budgets.push(timeoutMs);
          clock += timeoutMs;
          throw new Error('429 Resource exhausted');
        },
      }),
    ).rejects.toThrow();

    expect(budgets.every((budget) => budget < 1000)).toBe(true);
    expect(budgets.reduce((sum, budget) => sum + budget, 0)).toBeLessThanOrEqual(1000);
  });
});
