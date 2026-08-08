// Applies infra/managed-agent.json. See docs/managed-agent-backend.md.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);

const apiKey = process.env.MANAGED_AGENT_API_KEY?.trim() ?? process.env.ANTHROPIC_API_KEY?.trim();
if (!apiKey) {
  console.error('needs ANTHROPIC_API_KEY (or MANAGED_AGENT_API_KEY)');
  process.exit(1);
}

const manifestPath = value('manifest') ?? fileURLToPath(new URL('../../../infra/managed-agent.json', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { agent: Record<string, unknown> };
const existing = value('agent-id') ?? process.env.MANAGED_AGENT_ID?.trim();

if (flag('dry-run')) {
  console.log(existing ? `POST /v1/agents/${existing}` : 'POST /v1/agents');
  console.log(JSON.stringify(manifest.agent, null, 2));
  process.exit(0);
}

const response = await fetch(`https://api.anthropic.com/v1/agents${existing ? `/${existing}` : ''}`, {
  method: 'POST',
  headers: {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'managed-agents-2026-04-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify(manifest.agent),
});

const body = (await response.json()) as { id?: string; version?: number; error?: { message?: string } };
if (!response.ok) {
  console.error(`apply failed: ${response.status} ${body.error?.message ?? ''}`);
  process.exit(1);
}

// The version is the point: Console drift becomes visible.
console.log(`MANAGED_AGENT_ID=${body.id}`);
console.log(`agent version: ${body.version}`);
