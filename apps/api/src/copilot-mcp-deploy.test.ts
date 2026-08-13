import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../../infra/deploy-api.sh', import.meta.url), 'utf8');
const connectorMapping = 'COPILOT_MCP_CONNECTOR_SECRET=copilot-mcp-connector:latest';
const geminiMapping = 'GEMINI_API_KEY=gemini-api-key:latest';

describe('Copilot MCP connector deployment', () => {
  it('preserves the Agents secret prefix in both deploy paths', () => {
    expect(workflow).toContain(connectorMapping);
    expect(script).toContain(connectorMapping);
  });

  it('preserves Gemini credentials and managed lane ceilings in both deploy paths', () => {
    expect(workflow).toContain(geminiMapping);
    expect(script).toContain(geminiMapping);
    expect(workflow).toContain('MANAGED_AGENT_PROMPT_LANE');
    expect(script).toContain('MANAGED_AGENT_PROMPT_LANE');
    expect(workflow).toContain('MANAGED_AGENT_MAX_TOTAL_TOKENS');
    expect(script).toContain('MANAGED_AGENT_MAX_TOTAL_TOKENS');
  });

  // A ceiling no deploy path forwards does not exist.
  it('forwards every managed usage ceiling in both deploy paths', () => {
    for (const ceiling of [
      'MANAGED_AGENT_MAX_SECONDS',
      'MANAGED_AGENT_MAX_LIST_COST_CENTS',
      'MANAGED_AGENT_COPILOT_MAX_CREDITS',
      'MANAGED_AGENT_MAX_TOTAL_TOKENS',
    ]) {
      expect(workflow).toContain(ceiling);
      expect(script).toContain(ceiling);
    }
  });
});
