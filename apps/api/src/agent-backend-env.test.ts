import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
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
  'MANAGED_AGENT_PROMPT_LANE',
  'MANAGED_AGENT_COPILOT_MAX_CREDITS',
  'MANAGED_AGENT_MAX_TOTAL_TOKENS',
  'GEMINI_API_KEY',
  'AGENT_TASKS_TOKEN',
  'AGENT_TASKS_MODEL',
  'GAMES_REPO',
  'GAMES_PUBLISHED_REF',
  'AGENT_CUSTOM_AGENT',
  'MANAGED_AGENT_COPILOT_MCP_REPO',
  'MANAGED_AGENT_COPILOT_MCP_BASE_REF',
  'MANAGED_AGENT_COPILOT_MCP_CUSTOM_AGENT',
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
      AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
      MANAGED_AGENT_MAX_SECONDS: '900',
    });
    const warn = vi.fn();
    const registry = createAgentBackendRegistryFromEnv({ info: vi.fn(), warn });

    // The default vendor's own backend failed to build...
    expect(registry.platformByVendor.has('anthropic')).toBe(false);
    // ...but a stray AGENT_TASKS_TOKEN still builds Copilot's independently.
    expect(registry.platformByVendor.has('copilot')).toBe(true);
    expect(registry.defaultVendor).toBe('anthropic');
    expect(registry.self.name).toBe('self');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'anthropic' }),
      expect.stringContaining('platform dispatch stays off'),
    );
  });

  it('builds no default platform backend when no managed vendor is selected', () => {
    // MP-04: unset MANAGED_AGENT_VENDOR must not silently default to Copilot.
    setEnv({
      MANAGED_AGENT_VENDOR: undefined,
      AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
      MANAGED_AGENT_MAX_SECONDS: '900',
    });
    const registry = createAgentBackendRegistryFromEnv({ info: vi.fn(), warn: vi.fn() });
    expect(registry.defaultVendor).toBeUndefined();
    expect(registry.platformByVendor.has('copilot')).toBe(true);
    expect(registry.self.name).toBe('self');
  });

  it('selects the managed vendor over Copilot when the managed config is valid', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'anthropic',
      MANAGED_AGENT_API_KEY: randomBytes(32).toString('hex'),
      MANAGED_AGENT_MODEL: 'claude-sonnet-5',
      MANAGED_AGENT_ID: 'agent_test',
      MANAGED_AGENT_ENVIRONMENT_ID: 'env_test',
      MANAGED_AGENT_MAX_SECONDS: '120',
      MANAGED_AGENT_MAX_LIST_COST_CENTS: '100',
      MANAGED_AGENT_MCP_URL: 'https://www.gamedev.pl/api/mcp',
      AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
    });
    const registry = createAgentBackendRegistryFromEnv({ info: vi.fn(), warn: vi.fn() });
    expect(registry.platformByVendor.get('anthropic')?.name).toBe('managed:anthropic');
    expect(registry.platformByVendor.has('gemini')).toBe(false);
  });

  it('builds Copilot from its own token and model configuration', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'copilot',
      AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
      AGENT_TASKS_MODEL: undefined,
      MANAGED_AGENT_MAX_SECONDS: '900',
      MANAGED_AGENT_COPILOT_MAX_CREDITS: '25',
    });
    const info = vi.fn();
    const registry = createAgentBackendRegistryFromEnv({ info, warn: vi.fn() }, undefined, {
      deliver: async () => ({ version: 'v1' }),
    });

    expect(registry.platformByVendor.get('copilot')?.name).toBe('managed:copilot');
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'copilot', model: 'claude-sonnet-4.6' }),
      'managed agent dispatch enabled',
    );
  });

  // Half-configured is worse than off: the MCP round would hit games.
  it('fails closed when the Copilot MCP lane has no scratch repo', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'copilot',
      AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
      MANAGED_AGENT_MCP_URL: 'https://www.gamedev.pl/api/mcp',
      MANAGED_AGENT_MAX_SECONDS: '900',
      MANAGED_AGENT_PROMPT_LANE: 'mcp',
    });
    const warn = vi.fn();
    const registry = createAgentBackendRegistryFromEnv({ info: vi.fn(), warn }, undefined, {
      deliver: async () => ({ version: 'v1' }),
    });

    expect(registry.platformByVendor.get('copilot')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'copilot' }),
      'copilot MCP lane is enabled but MANAGED_AGENT_COPILOT_MCP_REPO is missing',
    );
  });

  it('accepts a separate MCP-lane repo for Copilot without changing backend selection', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'copilot',
      AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
      MANAGED_AGENT_MCP_URL: 'https://www.gamedev.pl/api/mcp',
      MANAGED_AGENT_PROMPT_LANE: 'mcp',
      MANAGED_AGENT_MAX_SECONDS: '900',
      GAMES_REPO: 'gamedevpl/www.gamedev.pl-games',
      MANAGED_AGENT_COPILOT_MCP_REPO: 'gamedevpl/scratchpad',
      MANAGED_AGENT_COPILOT_MCP_CUSTOM_AGENT: 'game-builder-mcp',
    });
    const registry = createAgentBackendRegistryFromEnv({ info: vi.fn(), warn: vi.fn() }, undefined, {
      deliver: async () => ({ version: 'v1' }),
    });

    expect(registry.platformByVendor.get('copilot')?.name).toBe('managed:copilot');
  });

  it('builds Gemini with its native token budget and default model', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'gemini',
      MANAGED_AGENT_API_KEY: `gemini-${randomUUID()}`,
      MANAGED_AGENT_MODEL: undefined,
      MANAGED_AGENT_MAX_SECONDS: '900',
      MANAGED_AGENT_MAX_TOTAL_TOKENS: '50000',
      MANAGED_AGENT_MCP_URL: 'https://www.gamedev.pl/api/mcp',
      AGENT_TASKS_TOKEN: `copilot-${randomUUID()}`,
    });
    const info = vi.fn();
    const registry = createAgentBackendRegistryFromEnv({ info, warn: vi.fn() });

    expect(registry.platformByVendor.get('gemini')?.name).toBe('managed:gemini');
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'gemini', model: 'gemini-3.7-flash' }),
      'managed agent dispatch enabled',
    );
  });

  it('fails closed when Gemini has an invalid token ceiling', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'gemini',
      MANAGED_AGENT_API_KEY: `gemini-${randomUUID()}`,
      MANAGED_AGENT_MCP_URL: 'https://www.gamedev.pl/api/mcp',
      MANAGED_AGENT_MAX_SECONDS: '900',
      MANAGED_AGENT_MAX_TOTAL_TOKENS: '0',
    });
    const warn = vi.fn();
    const registry = createAgentBackendRegistryFromEnv({ info: vi.fn(), warn });

    expect(registry.platformByVendor.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'gemini' }),
      expect.stringContaining('token ceiling'),
    );
  });

  it('fails closed when an MCP-default provider has no endpoint', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'gemini',
      MANAGED_AGENT_API_KEY: `gemini-${randomUUID()}`,
      MANAGED_AGENT_MAX_SECONDS: '900',
    });
    const warn = vi.fn();
    const registry = createAgentBackendRegistryFromEnv({ info: vi.fn(), warn });

    expect(registry.platformByVendor.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'gemini' }),
      expect.stringContaining('MCP lane'),
    );
  });

  // Every vendor: an unbilled one can run for hours unnoticed.
  it.each(['copilot', 'gemini'])('fails closed when %s has no wall-clock ceiling', (vendor) => {
    setEnv({
      MANAGED_AGENT_VENDOR: vendor,
      MANAGED_AGENT_API_KEY: `key-${randomUUID()}`,
      AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
      MANAGED_AGENT_MCP_URL: 'https://www.gamedev.pl/api/mcp',
      MANAGED_AGENT_MAX_SECONDS: undefined,
    });
    const warn = vi.fn();
    const registry = createAgentBackendRegistryFromEnv({ info: vi.fn(), warn });

    expect(registry.platform).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ vendor }),
      expect.stringContaining('MANAGED_AGENT_MAX_SECONDS'),
    );
  });
});
