import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentBackendRegistryFromEnv } from './agent-backend-env.js';

const ENV_KEYS = [
  'MANAGED_AGENT_VENDOR',
  'MANAGED_AGENT_API_KEY',
  'MANAGED_AGENT_MODEL',
  'MANAGED_AGENT_ID',
  'MANAGED_AGENT_ENVIRONMENT_ID',
  'MANAGED_AGENT_MAX_SECONDS',
  'MANAGED_AGENT_MAX_LIST_COST_CENTS',
  'MANAGED_AGENT_MCP_URL',
  'AGENT_TASKS_TOKEN',
] as const;

describe('createAgentBackendRegistryFromEnv', () => {
  const previous = new Map<string, string | undefined>();

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previous.clear();
    vi.restoreAllMocks();
  });

  function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): void {
    for (const key of ENV_KEYS) {
      if (!previous.has(key)) previous.set(key, process.env[key]);
      const next = values[key];
      if (next === undefined) delete process.env[key];
      else process.env[key] = next;
    }
  }

  it('fails closed when a managed vendor is selected but invalid', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'anthropic',
      // Missing key/model/ids — config is invalid.
      AGENT_TASKS_TOKEN: 'ghp_test_token_for_fail_closed',
    });
    const warn = vi.fn();
    const registry = createAgentBackendRegistryFromEnv({ info: vi.fn(), warn });

    expect(registry.platform).toBeUndefined();
    expect(registry.self.name).toBe('self');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'anthropic' }),
      expect.stringContaining('platform dispatch stays off'),
    );
  });

  it('falls back to Copilot only when no managed vendor was selected', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: undefined,
      AGENT_TASKS_TOKEN: 'ghp_test_token_for_copilot_fallback',
    });
    const registry = createAgentBackendRegistryFromEnv({ info: vi.fn(), warn: vi.fn() });
    expect(registry.platform?.name).toBe('copilot');
  });

  it('selects the managed vendor over Copilot when the managed config is valid', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'anthropic',
      MANAGED_AGENT_API_KEY: 'sk-test',
      MANAGED_AGENT_MODEL: 'claude-sonnet-5',
      MANAGED_AGENT_ID: 'agent_test',
      MANAGED_AGENT_ENVIRONMENT_ID: 'env_test',
      MANAGED_AGENT_MAX_SECONDS: '120',
      MANAGED_AGENT_MAX_LIST_COST_CENTS: '100',
      MANAGED_AGENT_MCP_URL: 'https://www.gamedev.pl/api/mcp',
      AGENT_TASKS_TOKEN: 'ghp_must_not_win_when_managed_is_valid',
    });
    const registry = createAgentBackendRegistryFromEnv({ info: vi.fn(), warn: vi.fn() });
    expect(registry.platform?.name).toBe('managed:anthropic');
  });
});
