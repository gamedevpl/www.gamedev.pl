import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createAgentBackendRegistryFromEnv } from './agent-backend-env.js';
import { registerManagedProvider, type ManagedProviderConfig } from './managed-agent.js';
import { createGeminiManagedProvider } from './managed-provider-gemini.js';

const ENV_KEYS = [
  'MANAGED_AGENT_VENDOR',
  'MANAGED_AGENT_API_KEY',
  'MANAGED_AGENT_MODEL',
  'MANAGED_AGENT_GEMINI_MODEL',
  'MANAGED_AGENT_OPENAI_MODEL',
  'MANAGED_AGENT_ID',
  'MANAGED_AGENT_ENVIRONMENT_ID',
  'MANAGED_AGENT_MAX_SECONDS',
  'MANAGED_AGENT_MAX_LIST_COST_CENTS',
  'MANAGED_AGENT_MCP_URL',
  'MANAGED_AGENT_COPILOT_MAX_CREDITS',
  'MANAGED_AGENT_MAX_TOTAL_TOKENS',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'AGENT_TASKS_TOKEN',
  'AGENT_TASKS_MODEL',
  'MANAGED_AGENT_COPILOT_MCP_REPO',
  'MANAGED_AGENT_COPILOT_MCP_BASE_REF',
  'MANAGED_AGENT_COPILOT_MCP_CUSTOM_AGENT',
] as const;

const MCP_URL = 'https://www.gamedev.pl/api/mcp';

// N1: app.ts supplies catalog's client; the registry builds none.
const GITHUB_STUB = {
  deleteBranch: async () => {},
  listWorkflowRuns: async () => [],
  cancelWorkflowRun: async () => {},
};

function registryFromEnv(log: { info: () => void; warn: () => void }) {
  return createAgentBackendRegistryFromEnv(log, undefined, { githubClientFactory: () => GITHUB_STUB });
}

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
      MANAGED_AGENT_MCP_URL: MCP_URL,
      MANAGED_AGENT_COPILOT_MCP_REPO: 'gamedevpl/scratchpad',
      MANAGED_AGENT_COPILOT_MAX_CREDITS: '20',
      MANAGED_AGENT_MAX_TOTAL_TOKENS: '2000000',
    });
    const warn = vi.fn();
    const registry = registryFromEnv({ info: vi.fn(), warn });

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
      MANAGED_AGENT_MCP_URL: MCP_URL,
      MANAGED_AGENT_COPILOT_MCP_REPO: 'gamedevpl/scratchpad',
      MANAGED_AGENT_COPILOT_MAX_CREDITS: '20',
      MANAGED_AGENT_MAX_TOTAL_TOKENS: '2000000',
    });
    const registry = registryFromEnv({ info: vi.fn(), warn: vi.fn() });
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
      MANAGED_AGENT_MCP_URL: MCP_URL,
      AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
    });
    const registry = registryFromEnv({ info: vi.fn(), warn: vi.fn() });
    expect(registry.platformByVendor.get('anthropic')?.name).toBe('managed:anthropic');
    expect(registry.platformByVendor.has('gemini')).toBe(false);
  });

  it("never leaks Anthropic's agent/environment ids into Gemini's config", () => {
    let seen: ManagedProviderConfig | undefined;
    registerManagedProvider('gemini', (config) => {
      seen = config;
      return createGeminiManagedProvider(config);
    });
    try {
      setEnv({
        MANAGED_AGENT_VENDOR: 'anthropic',
        MANAGED_AGENT_API_KEY: randomBytes(32).toString('hex'),
        MANAGED_AGENT_MODEL: 'claude-sonnet-5',
        MANAGED_AGENT_ID: 'agent_test',
        MANAGED_AGENT_ENVIRONMENT_ID: 'env_test',
        MANAGED_AGENT_MAX_SECONDS: '120',
        MANAGED_AGENT_MAX_LIST_COST_CENTS: '100',
        MANAGED_AGENT_MCP_URL: MCP_URL,
        MANAGED_AGENT_MAX_TOTAL_TOKENS: '2000000',
        GEMINI_API_KEY: `gemini-${randomUUID()}`,
        AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
      });
      const registry = registryFromEnv({ info: vi.fn(), warn: vi.fn() });
      expect(registry.platformByVendor.has('gemini')).toBe(true);
      expect(seen?.agentId).toBeUndefined();
      expect(seen?.environmentId).toBeUndefined();
    } finally {
      registerManagedProvider('gemini', createGeminiManagedProvider);
    }
  });

  it('builds Copilot from its own token, model, and scratch repo configuration', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'copilot',
      AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
      AGENT_TASKS_MODEL: undefined,
      MANAGED_AGENT_MAX_SECONDS: '900',
      MANAGED_AGENT_COPILOT_MAX_CREDITS: '25',
      MANAGED_AGENT_MCP_URL: MCP_URL,
      MANAGED_AGENT_COPILOT_MCP_REPO: 'gamedevpl/scratchpad',
      MANAGED_AGENT_COPILOT_MAX_CREDITS: '20',
      MANAGED_AGENT_MAX_TOTAL_TOKENS: '2000000',
      MANAGED_AGENT_COPILOT_MCP_CUSTOM_AGENT: 'game-builder-mcp',
    });
    const info = vi.fn();
    const registry = registryFromEnv({ info, warn: vi.fn() });

    expect(registry.platformByVendor.get('copilot')?.name).toBe('managed:copilot');
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'copilot', model: 'claude-sonnet-4.6' }),
      'managed agent dispatch enabled',
    );
  });

  // Every managed vendor dispatches over MCP; there is no other lane.
  it('fails closed when Copilot has no MCP endpoint', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'copilot',
      AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
      MANAGED_AGENT_MAX_SECONDS: '900',
      MANAGED_AGENT_COPILOT_MCP_REPO: 'gamedevpl/scratchpad',
      MANAGED_AGENT_COPILOT_MAX_CREDITS: '20',
      MANAGED_AGENT_MAX_TOTAL_TOKENS: '2000000',
    });
    const warn = vi.fn();
    const registry = registryFromEnv({ info: vi.fn(), warn });

    expect(registry.platformByVendor.get('copilot')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'copilot' }),
      expect.stringContaining('MANAGED_AGENT_MCP_URL'),
    );
  });

  // Half-configured is worse than off: nowhere to dispatch.
  it('fails closed when Copilot has no scratch repo configured', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'copilot',
      AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
      MANAGED_AGENT_MCP_URL: MCP_URL,
      MANAGED_AGENT_MAX_SECONDS: '900',
    });
    const warn = vi.fn();
    const registry = registryFromEnv({ info: vi.fn(), warn });

    expect(registry.platformByVendor.get('copilot')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'copilot' }),
      expect.stringContaining('MANAGED_AGENT_COPILOT_MCP_REPO'),
    );
  });

  it('builds Gemini with its native token budget and default model', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'gemini',
      MANAGED_AGENT_API_KEY: `gemini-${randomUUID()}`,
      MANAGED_AGENT_MODEL: undefined,
      MANAGED_AGENT_MAX_SECONDS: '900',
      MANAGED_AGENT_MAX_TOTAL_TOKENS: '50000',
      MANAGED_AGENT_MCP_URL: MCP_URL,
      AGENT_TASKS_TOKEN: `copilot-${randomUUID()}`,
    });
    const info = vi.fn();
    const registry = registryFromEnv({ info, warn: vi.fn() });

    expect(registry.platformByVendor.get('gemini')?.name).toBe('managed:gemini');
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'gemini', model: 'gemini-3.8-flash' }),
      'managed agent dispatch enabled',
    );
  });

  it('does not let an Anthropic model name leak into Gemini', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'gemini',
      MANAGED_AGENT_API_KEY: `gemini-${randomUUID()}`,
      // The Anthropic default vendor's model — must never reach Gemini's agent_config.
      MANAGED_AGENT_MODEL: 'claude-sonnet-5',
      MANAGED_AGENT_MAX_SECONDS: '900',
      MANAGED_AGENT_MAX_TOTAL_TOKENS: '50000',
      MANAGED_AGENT_MCP_URL: MCP_URL,
      AGENT_TASKS_TOKEN: `copilot-${randomUUID()}`,
    });
    const info = vi.fn();
    registryFromEnv({ info, warn: vi.fn() });

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'gemini', model: 'gemini-3.8-flash' }),
      'managed agent dispatch enabled',
    );
  });

  it('fails closed when Gemini has an invalid token ceiling', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'gemini',
      MANAGED_AGENT_API_KEY: `gemini-${randomUUID()}`,
      MANAGED_AGENT_MCP_URL: MCP_URL,
      MANAGED_AGENT_MAX_SECONDS: '900',
      MANAGED_AGENT_MAX_TOTAL_TOKENS: '0',
    });
    const warn = vi.fn();
    const registry = registryFromEnv({ info: vi.fn(), warn });

    expect(registry.platformByVendor.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'gemini' }),
      expect.stringContaining('token ceiling'),
    );
  });

  it('fails closed when a provider has no MCP endpoint', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'gemini',
      MANAGED_AGENT_API_KEY: `gemini-${randomUUID()}`,
      MANAGED_AGENT_MAX_SECONDS: '900',
    });
    const warn = vi.fn();
    const registry = registryFromEnv({ info: vi.fn(), warn });

    expect(registry.platformByVendor.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'gemini' }),
      expect.stringContaining('MANAGED_AGENT_MCP_URL'),
    );
  });

  it('builds openai with its own key, model and native token ceiling — never MANAGED_AGENT_API_KEY alone unless it is default', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'openai',
      OPENAI_API_KEY: `openai-${randomUUID()}`,
      MANAGED_AGENT_OPENAI_MODEL: 'gpt-openai-test',
      MANAGED_AGENT_MAX_SECONDS: '900',
      MANAGED_AGENT_MAX_TOTAL_TOKENS: '50000',
      MANAGED_AGENT_MCP_URL: MCP_URL,
    });
    const info = vi.fn();
    const registry = registryFromEnv({ info, warn: vi.fn() });

    expect(registry.platformByVendor.get('openai')?.name).toBe('managed:openai');
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'openai', model: 'gpt-openai-test' }),
      'managed agent dispatch enabled',
    );
  });

  it('fails closed when openai has no model configured — it is never defaulted', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'openai',
      OPENAI_API_KEY: `openai-${randomUUID()}`,
      MANAGED_AGENT_MAX_SECONDS: '900',
      MANAGED_AGENT_MCP_URL: MCP_URL,
    });
    const warn = vi.fn();
    const registry = registryFromEnv({ info: vi.fn(), warn });

    expect(registry.platformByVendor.has('openai')).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'openai' }),
      expect.stringContaining('MANAGED_AGENT_API_KEY / MANAGED_AGENT_MODEL'),
    );
  });

  it('does not let an unconfigured Anthropic bring down a separately configured openai backend', () => {
    setEnv({
      MANAGED_AGENT_VENDOR: 'anthropic',
      // Anthropic itself is left invalid (no agentId/environmentId).
      OPENAI_API_KEY: `openai-${randomUUID()}`,
      MANAGED_AGENT_OPENAI_MODEL: 'gpt-openai-test',
      MANAGED_AGENT_MAX_SECONDS: '900',
      MANAGED_AGENT_MAX_TOTAL_TOKENS: '2000000',
      MANAGED_AGENT_MCP_URL: MCP_URL,
    });
    const registry = registryFromEnv({ info: vi.fn(), warn: vi.fn() });

    expect(registry.platformByVendor.has('anthropic')).toBe(false);
    expect(registry.platformByVendor.get('openai')?.name).toBe('managed:openai');
  });

  // A wall clock bounds time, never spend.
  it.each([
    ['copilot', 'MANAGED_AGENT_COPILOT_MAX_CREDITS'],
    ['gemini', 'MANAGED_AGENT_MAX_TOTAL_TOKENS'],
    ['openai', 'MANAGED_AGENT_MAX_TOTAL_TOKENS'],
  ])('fails closed when %s has no spend ceiling', (vendor, missingVar) => {
    setEnv({
      MANAGED_AGENT_VENDOR: vendor,
      MANAGED_AGENT_API_KEY: randomBytes(32).toString('hex'),
      MANAGED_AGENT_MODEL: 'model-test',
      GEMINI_API_KEY: `gemini-${randomUUID()}`,
      OPENAI_API_KEY: `openai-${randomUUID()}`,
      MANAGED_AGENT_OPENAI_MODEL: 'gpt-openai-test',
      AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
      MANAGED_AGENT_COPILOT_MCP_REPO: 'gamedevpl/scratchpad',
      MANAGED_AGENT_MAX_SECONDS: '900',
      MANAGED_AGENT_MCP_URL: MCP_URL,
      [missingVar]: undefined,
    });
    const warn = vi.fn();
    const registry = createAgentBackendRegistryFromEnv({ info: vi.fn(), warn });

    expect(registry.platformByVendor.has(vendor as never)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ vendor }), expect.stringContaining('ceiling'));
  });

  // Every vendor: an unbilled one can run for hours unnoticed.
  it.each(['copilot', 'gemini', 'openai'])('fails closed when %s has no wall-clock ceiling', (vendor) => {
    setEnv({
      MANAGED_AGENT_VENDOR: vendor,
      MANAGED_AGENT_API_KEY: `key-${randomUUID()}`,
      AGENT_TASKS_TOKEN: randomBytes(32).toString('hex'),
      MANAGED_AGENT_OPENAI_MODEL: vendor === 'openai' ? `model-${randomUUID()}` : undefined,
      MANAGED_AGENT_MCP_URL: MCP_URL,
      MANAGED_AGENT_COPILOT_MCP_REPO: 'gamedevpl/scratchpad',
      MANAGED_AGENT_COPILOT_MAX_CREDITS: '20',
      MANAGED_AGENT_MAX_TOTAL_TOKENS: '2000000',
      MANAGED_AGENT_MAX_SECONDS: undefined,
    });
    const warn = vi.fn();
    const registry = registryFromEnv({ info: vi.fn(), warn });

    expect(registry.platform).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ vendor }),
      expect.stringContaining('MANAGED_AGENT_MAX_SECONDS'),
    );
  });
});
