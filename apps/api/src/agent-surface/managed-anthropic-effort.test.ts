import { afterEach, describe, expect, it, vi } from 'vitest';
import { managedEffortFor } from './agent-backend-env.js';
import { createAnthropicManagedProvider } from './managed-provider-anthropic.js';

const KEYS = ['MANAGED_AGENT_EFFORT', 'MANAGED_AGENT_ANTHROPIC_EFFORT'] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('managed Anthropic effort', () => {
  it('reads its own variable, and never hands it to another vendor', () => {
    process.env.MANAGED_AGENT_ANTHROPIC_EFFORT = 'medium';
    delete process.env.MANAGED_AGENT_EFFORT;

    expect(managedEffortFor('anthropic')).toBe('medium');
    expect(managedEffortFor('gemini')).toBeUndefined();
  });

  it('drops a typo with a warning instead of guessing', () => {
    process.env.MANAGED_AGENT_ANTHROPIC_EFFORT = 'meduim';
    const warn = vi.fn();

    expect(managedEffortFor('anthropic', { info: vi.fn(), warn })).toBeUndefined();
    expect(warn).toHaveBeenCalledWith({ effort: 'meduim' }, expect.stringContaining('MANAGED_AGENT_ANTHROPIC_EFFORT'));
  });

  it('sends the effort inside the model override, which replaces the Agent model', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ id: 'sess_1', status: 'queued' }), { status: 200 }),
    );
    const provider = createAnthropicManagedProvider({
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
      agentId: 'agent_test',
      environmentId: 'env_test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.startSession({
      correlationId: '1',
      prompt: 'p',
      model: 'claude-sonnet-5-5',
      outputPath: 'o',
      effort: 'medium',
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).agent.model).toEqual({ id: 'claude-sonnet-5-5', effort: { type: 'medium' } });
  });
});
