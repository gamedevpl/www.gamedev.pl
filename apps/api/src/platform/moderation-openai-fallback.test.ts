import { genaicode } from 'genaicode';
import { toOpenAIRequest } from 'genaicode/providers';
import type { GenerationRequest } from 'genaicode';
import { describe, expect, it } from 'vitest';
import { MODERATION_BILLING_EXHAUSTED_MSG, MODERATION_FAILED_CLOSED_PREFIX } from './moderation-metrics.js';
import { OPENAI_FALLBACK_MODEL as LUNA, VertexChecker } from './moderation.js';
import { OPENAI_REFINE_FALLBACK_MODEL } from './vertex-fallback-models.js';

describe('VertexChecker on the OpenAI stand-in', () => {
  // Luna rejects temperature 0; genaicode strips it on the wire.
  it('falls back to the OpenAI stand-in after Vertex capacity misses', async () => {
    const seen: GenerationRequest[] = [];
    const checker = new VertexChecker({
      retryDelayMs: 0,
      fallbackModel: LUNA,
      fallbackApiKey: 'test-key',
      client: genaicode({
        name: 'stub',
        async generate(request) {
          seen.push(request);
          if (seen.length < 3) throw new Error('429 Resource exhausted');
          return { parts: [{ type: 'text', text: '{"allowed": true, "category": null}' }] };
        },
      }),
    });

    expect(await checker.check('A cozy farming game')).toEqual({ allowed: true });
    expect(seen.map((request) => request.temperature)).toEqual([0, 0, 0]);
  });

  it('takes the stand-in verdict when the primary account has no credits', async () => {
    const models: (string | undefined)[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    };
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
    try {
      const checker = new VertexChecker({
        retryDelayMs: 0,
        timeoutMs: 1_000,
        fallbackModel: LUNA,
        fallbackApiKey: 'test-key',
        vertexFetcher: async (_text, model) => {
          models.push(model);
          if (model === undefined) throw new Error('RateLimitError: 429 You have no credits remaining');
          return { allowed: false, category: 'violence' };
        },
      });
      expect(await checker.check('A cozy farming game')).toEqual({ allowed: false, category: 'violence' });
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
    }
    expect(models).toEqual([undefined, LUNA]);
    expect(errors.join('\n')).toContain(MODERATION_BILLING_EXHAUSTED_MSG);
    expect(warnings.join('\n')).not.toContain(MODERATION_FAILED_CLOSED_PREFIX);
  });

  it('logs a spent account at error and does not treat it as a transient timeout', async () => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    };
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
    try {
      const checker = new VertexChecker({
        retryDelayMs: 0,
        timeoutMs: 1_000,
        fallbackApiKey: '',
        vertexFetcher: async () => {
          throw new Error('429 You have no credits remaining');
        },
      });
      expect(await checker.check('A cozy farming game')).toEqual({
        allowed: false,
        category: 'other',
        unavailable: true,
      });
      const transient = new VertexChecker({
        retryDelayMs: 0,
        timeoutMs: 1_000,
        fallbackApiKey: '',
        vertexFetcher: async () => {
          throw new Error('429 Resource exhausted');
        },
      });
      expect(await transient.check('A quiet puzzle')).toMatchObject({ unavailable: true });
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
    }
    expect(errors.join('\n')).toContain(MODERATION_BILLING_EXHAUSTED_MSG);
    expect(warnings.join('\n')).toContain(MODERATION_FAILED_CLOSED_PREFIX);
    expect(warnings.join('\n')).not.toContain('no credits remaining');
  });
});

describe('OpenAI stand-in models on the wire', () => {
  // A model genaicode does not know would send temperature again.
  it.each([LUNA, OPENAI_REFINE_FALLBACK_MODEL])('%s is sent without temperature', (model) => {
    const request = toOpenAIRequest({ prompt: [{ type: 'user', text: 'hi' }], temperature: 0 }, model);
    expect(request.model).toBe(model);
    expect(request.temperature).toBeUndefined();
  });
});
