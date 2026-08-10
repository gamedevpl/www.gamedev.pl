import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../../infra/deploy-api.sh', import.meta.url), 'utf8');
const connectorMapping = 'COPILOT_MCP_CONNECTOR_SECRET=copilot-mcp-connector:latest';

describe('Copilot MCP connector deployment', () => {
  it('preserves the Agents secret prefix in both deploy paths', () => {
    expect(workflow).toContain(connectorMapping);
    expect(script).toContain(connectorMapping);
  });
});
