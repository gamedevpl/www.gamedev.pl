import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../../infra/deploy-api.sh', import.meta.url), 'utf8');
const geminiMapping = 'GEMINI_API_KEY=gemini-api-key:latest';

describe('managed agent deployment config', () => {
  it('preserves Gemini credentials and managed usage ceilings in both deploy paths', () => {
    expect(workflow).toContain(geminiMapping);
    expect(script).toContain(geminiMapping);
    expect(workflow).toContain('MANAGED_AGENT_MAX_TOTAL_TOKENS');
    expect(script).toContain('MANAGED_AGENT_MAX_TOTAL_TOKENS');
  });

  // A variable nobody reads is a landmine waiting to be misread.
  it.each(['MANAGED_AGENT_PROMPT_LANE', 'AGENT_TASKS_', 'MANAGED_AGENT_COPILOT_', 'COPILOT_MCP_CONNECTOR_SECRET'])(
    'does not forward the retired %s variable',
    (retired) => {
      expect(workflow).not.toContain(retired);
      expect(script).not.toContain(retired);
    },
  );

  // A ceiling no deploy path forwards does not exist.
  it('forwards every managed usage ceiling in both deploy paths', () => {
    for (const ceiling of [
      'MANAGED_AGENT_MAX_SECONDS',
      'MANAGED_AGENT_MAX_LIST_COST_CENTS',
      'MANAGED_AGENT_MAX_TOTAL_TOKENS',
    ]) {
      expect(workflow).toContain(ceiling);
      expect(script).toContain(ceiling);
    }
  });
});
