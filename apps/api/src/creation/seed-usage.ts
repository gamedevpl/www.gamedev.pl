import type { GenerationResult } from 'genaicode';
import type { SeedUsage } from './game-seed.js';

function googleOutputTokens(raw: unknown): number {
  if (!raw || typeof raw !== 'object' || !('usageMetadata' in raw)) return 0;
  const usage = raw.usageMetadata;
  if (!usage || typeof usage !== 'object') return 0;
  const visible = 'candidatesTokenCount' in usage ? usage.candidatesTokenCount : 0;
  const thoughts = 'thoughtsTokenCount' in usage ? usage.thoughtsTokenCount : 0;
  return (typeof visible === 'number' ? visible : 0) + (typeof thoughts === 'number' ? thoughts : 0);
}

export function usageOf(result: GenerationResult, provider: string, fallbackModel: string): SeedUsage {
  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;
  const cached = result.usage?.cachedInputTokens;
  return {
    inputTokens,
    // Google bills thoughts; genaicode currently reports visible output only.
    outputTokens: provider === 'vertex' ? Math.max(outputTokens, googleOutputTokens(result.raw)) : outputTokens,
    ...(cached !== undefined ? { cachedInputTokens: Math.min(inputTokens, Math.max(0, cached)) } : {}),
    model: result.model ?? fallbackModel,
    provider,
  };
}

export function sumSeedUsage(first: SeedUsage, next: SeedUsage): SeedUsage {
  return {
    ...next,
    inputTokens: first.inputTokens + next.inputTokens,
    outputTokens: first.outputTokens + next.outputTokens,
    ...(first.cachedInputTokens !== undefined || next.cachedInputTokens !== undefined
      ? { cachedInputTokens: (first.cachedInputTokens ?? 0) + (next.cachedInputTokens ?? 0) }
      : {}),
  };
}
