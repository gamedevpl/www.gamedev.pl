import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { noSymlinks, writePluginFile } from './plugin-files.js';

type JsonObject = Record<string, unknown>;
export interface MuseMcpReceipt {
  key: 'mcpServers' | 'mcp_servers';
  server: JsonObject;
  createdFile: boolean;
  createdMap: boolean;
}

function object(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function settings(file: string): JsonObject {
  noSymlinks(file);
  if (!existsSync(file)) return { schema_version: 1 };
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new CliError('Muse settings are not valid JSON; refusing to change them', EXIT_REFUSED);
  }
  if (!object(value) || value.schema_version !== 1 || ('mcpServers' in value && 'mcp_servers' in value))
    throw new CliError('Muse settings have an unsupported schema; refusing to change them', EXIT_REFUSED);
  for (const key of ['mcpServers', 'mcp_servers'])
    if (key in value && !object(value[key]))
      throw new CliError('Muse MCP configuration must be an object', EXIT_REFUSED);
  return value;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(canonical));
  if (object(value))
    return JSON.stringify(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return JSON.stringify(value) ?? 'undefined';
}

export function planMuseMcp(file: string, source: string): MuseMcpReceipt {
  const value = settings(file);
  const key = 'mcp_servers' in value ? 'mcp_servers' : 'mcpServers';
  const map = value[key] as JsonObject | undefined;
  if (map && ('gamedevpl_cli' in map || 'gamedevpl' in map))
    throw new CliError('Muse already has a gamedev.pl MCP connection; refusing to replace it', EXIT_REFUSED);
  return {
    key,
    server: {
      command: process.execPath,
      args: [join(source, 'plugin/mcp.mjs')],
      env: { GAMEDEV_CREATOR_KEY: '${GAMEDEV_CREATOR_KEY:-}' },
    },
    createdFile: !existsSync(file),
    createdMap: !(key in value),
  };
}

export function museMcpState(file: string, receipt: MuseMcpReceipt): 'owned' | 'absent' | 'modified' {
  const value = settings(file);
  const key = 'mcp_servers' in value ? 'mcp_servers' : 'mcpServers';
  const map = value[key] as JsonObject | undefined;
  if (!map || !Object.hasOwn(map, 'gamedevpl_cli')) return 'absent';
  return canonical(map.gamedevpl_cli) === canonical(receipt.server) ? 'owned' : 'modified';
}

export function installMuseMcp(file: string, receipt: MuseMcpReceipt): void {
  const value = settings(file);
  const map = (value[receipt.key] ?? {}) as JsonObject;
  if ('gamedevpl_cli' in map || 'gamedevpl' in map)
    throw new CliError('Muse MCP settings changed during installation; refusing to overwrite', EXIT_REFUSED);
  value[receipt.key] = { ...map, gamedevpl_cli: receipt.server };
  writePluginFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function uninstallMuseMcp(file: string, receipt: MuseMcpReceipt): void {
  const state = museMcpState(file, receipt);
  if (state === 'absent') return;
  if (state !== 'owned') throw new CliError('Muse MCP entry was customized; refusing to remove it', EXIT_REFUSED);
  const value = settings(file);
  const key = 'mcp_servers' in value ? 'mcp_servers' : 'mcpServers';
  const map = value[key] as JsonObject;
  delete map.gamedevpl_cli;
  if (receipt.createdMap && !Object.keys(map).length) delete value[key];
  if (receipt.createdFile && canonical(value) === canonical({ schema_version: 1 })) {
    noSymlinks(file);
    rmSync(file);
  } else writePluginFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
