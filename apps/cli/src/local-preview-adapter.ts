import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AdapterSpec } from './adapters.js';

export function localPreviewSupported(name: string): boolean {
  return ['codex', 'claude', 'copilot'].includes(name);
}
export function localPreviewAdapter(spec: AdapterSpec, endpoint: { url: string; authorization: string }) {
  if (!localPreviewSupported(spec.name)) throw new Error(`Local preview MCP is not supported by ${spec.name}.`);
  const name = 'gamedevpl_local';
  if (spec.name === 'codex') {
    const quote = (value: string) => JSON.stringify(value);
    return {
      spec: {
        ...spec,
        headless: [
          '-c',
          `mcp_servers.${name}.url=${quote(endpoint.url)}`,
          '-c',
          `mcp_servers.${name}.http_headers={ Authorization = ${quote(endpoint.authorization)} }`,
          ...spec.headless,
        ],
      },
      cleanup() {},
    };
  }
  const dir = mkdtempSync(join(tmpdir(), 'gamedev-local-mcp-'));
  const file = join(dir, 'config.json');
  const config = {
    mcpServers: {
      [name]: {
        type: 'http',
        url: endpoint.url,
        headers: { Authorization: endpoint.authorization },
        ...(spec.name === 'copilot' ? { tools: ['*'] } : {}),
      },
    },
  };
  writeFileSync(file, JSON.stringify(config), { mode: 0o600 });
  const flags =
    spec.name === 'claude'
      ? ['--mcp-config', file, '--allowedTools', `mcp__${name}__*`]
      : ['--additional-mcp-config', `@${file}`, `--allow-tool=${name}`];
  return {
    spec: { ...spec, headless: [...flags, ...spec.headless] },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
