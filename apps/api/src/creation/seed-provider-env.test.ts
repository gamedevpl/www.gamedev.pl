import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeedProvidersFromEnv } from './seed-provider-env.js';

const SEED_ENV_KEYS = [
  'SEED_PROVIDER',
  'SEED_MODEL',
  'SEED_MAX_OUTPUT_TOKENS',
  'SEED_PICK_MAX_OUTPUT_TOKENS',
  'SEED_ANTHROPIC_API_KEY',
  'SEED_ANTHROPIC_MODEL',
  'SEED_ANTHROPIC_MAX_OUTPUT_TOKENS',
  'SEED_ANTHROPIC_PICK_MAX_OUTPUT_TOKENS',
  'SEED_META_API_KEY',
  'SEED_META_MODEL',
  'SEED_META_MAX_OUTPUT_TOKENS',
  'SEED_META_PICK_MAX_OUTPUT_TOKENS',
] as const;

describe('createSeedProvidersFromEnv', () => {
  const previous = new Map<string, string | undefined>();

  afterEach(() => {
    for (const key of SEED_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previous.clear();
  });

  function setEnv(values: Partial<Record<(typeof SEED_ENV_KEYS)[number], string | undefined>>): void {
    for (const key of SEED_ENV_KEYS) {
      if (!previous.has(key)) previous.set(key, process.env[key]);
      const next = values[key];
      if (next === undefined) delete process.env[key];
      else process.env[key] = next;
    }
  }

  it('defaults Meta to an 8192 pick budget, unlike every other vendor', () => {
    setEnv({ SEED_META_API_KEY: 'k', SEED_META_MODEL: 'muse-spark-1.2' });
    const { providers } = createSeedProvidersFromEnv();
    expect(providers.get('meta')?.pickMaxOutputTokens).toBe(8192);
    expect(providers.get('vertex')?.pickMaxOutputTokens).toBeUndefined();
  });

  it('lets an explicit env var override the Meta default', () => {
    setEnv({ SEED_META_API_KEY: 'k', SEED_META_MODEL: 'muse-spark-1.2', SEED_META_PICK_MAX_OUTPUT_TOKENS: '4096' });
    const { providers } = createSeedProvidersFromEnv();
    expect(providers.get('meta')?.pickMaxOutputTokens).toBe(4096);
  });

  it('reads a per-vendor pick budget for a vendor with no built-in default', () => {
    setEnv({
      SEED_ANTHROPIC_API_KEY: 'k',
      SEED_ANTHROPIC_MODEL: 'claude-haiku-4-5',
      SEED_ANTHROPIC_PICK_MAX_OUTPUT_TOKENS: '3000',
    });
    const { providers } = createSeedProvidersFromEnv();
    expect(providers.get('anthropic')?.pickMaxOutputTokens).toBe(3000);
  });

  it('reads a Vertex-wide pick budget from the unprefixed var', () => {
    setEnv({ SEED_PICK_MAX_OUTPUT_TOKENS: '5000' });
    const { providers } = createSeedProvidersFromEnv();
    expect(providers.get('vertex')?.pickMaxOutputTokens).toBe(5000);
  });

  it('ignores a non-positive-integer pick budget and warns', () => {
    setEnv({ SEED_META_API_KEY: 'k', SEED_META_MODEL: 'muse-spark-1.2', SEED_META_PICK_MAX_OUTPUT_TOKENS: 'nope' });
    const warn = vi.fn();
    const { providers } = createSeedProvidersFromEnv({ info: vi.fn(), warn });
    // Falls back to the Meta-specific default, not the raw garbage value.
    expect(providers.get('meta')?.pickMaxOutputTokens).toBe(8192);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ envVar: 'SEED_META_PICK_MAX_OUTPUT_TOKENS' }),
      expect.stringContaining('not a positive integer'),
    );
  });
});
