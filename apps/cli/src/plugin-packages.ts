import { CODING_AGENT_PLUGIN_TARGETS } from '@gamedevpl/contract';
import { join } from 'node:path';
import assets from './generated/plugin-assets.json' with { type: 'json' };
import { CLI_VERSION } from './update.js';

export const PLUGIN_NAME = 'gamedevpl-cli';
export const PLUGIN_MARKET = 'gamedevpl-cli-bundled';
export const PLUGIN_TARGETS = CODING_AGENT_PLUGIN_TARGETS;
export type PluginTarget = (typeof PLUGIN_TARGETS)[number];

export function pluginFiles(target: PluginTarget, source: string): Record<string, Buffer> {
  const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const server = { command: process.execPath, args: [join(source, 'mcp.mjs')] };
  const metadata = {
    name: PLUGIN_NAME,
    version: CLI_VERSION,
    description: 'Build and improve browser games on gamedev.pl.',
    author: { name: 'gamedev.pl' },
    license: 'GPL-3.0-only',
  };
  const files: Record<string, Buffer> = {
    'skills/gamedevpl/SKILL.md': Buffer.from(assets.skill),
    'assets/logo.png': Buffer.from(assets.logo, 'base64'),
    'mcp.mjs': Buffer.from(assets.bridge),
    'README.md': Buffer.from(
      'Gamedev.pl integration installed by gamedevpl CLI.\n' +
        (target === 'vibe'
          ? 'Set GAMEDEV_CREATOR_KEY, then run gamedevpl plugins configure vibe to save its private key file.\n'
          : 'Set GAMEDEV_CREATOR_KEY in the agent environment or plugin settings.\n') +
        `gamedevpl update refreshes this unchanged owned package too; gamedevpl plugins update ${target} retries it separately.\n` +
        'This installation does not start a round or change gamedevpl connect.\n',
    ),
  };
  if (target === 'claude' || target === 'copilot') {
    files['.claude-plugin/plugin.json'] = json({ ...metadata, mcpServers: './.mcp.json' });
    files['.mcp.json'] = json({ mcpServers: { gamedevpl_cli: server } });
  }
  if (target === 'claude')
    files['.claude-plugin/marketplace.json'] = json({
      name: PLUGIN_MARKET,
      owner: { name: 'gamedev.pl' },
      plugins: [{ name: PLUGIN_NAME, source: './plugin' }],
    });
  if (target === 'codex') {
    files['.codex-plugin/plugin.json'] = json({ ...metadata, skills: './skills/', mcpServers: './.mcp.json' });
    files['.mcp.json'] = json({ mcpServers: { gamedevpl_cli: { ...server, env_vars: ['GAMEDEV_CREATOR_KEY'] } } });
    files['.agents/plugins/marketplace.json'] = json({
      name: PLUGIN_MARKET,
      plugins: [
        {
          name: PLUGIN_NAME,
          source: { source: 'local', path: './plugin' },
          policy: { installation: 'AVAILABLE', authentication: 'ON_USE' },
          category: 'Developer tools',
        },
      ],
    });
  }
  if (target === 'antigravity') {
    files['plugin.json'] = json({ ...metadata, displayName: 'Gamedev.pl', logo: 'assets/logo.png' });
    files['mcp_config.json'] = json({
      mcpServers: {
        gamedevpl_cli: {
          ...server,
          env: { GAMEDEV_CREATOR_KEY: '${GAMEDEV_CREATOR_KEY}' },
          variables: [{ name: 'GAMEDEV_CREATOR_KEY', title: 'Gamedev.pl creator key' }],
        },
      },
    });
  }
  if (target === 'cursor') {
    files['.cursor-plugin/plugin.json'] = json({ ...metadata, displayName: 'Gamedev.pl', logo: 'assets/logo.png' });
    files['mcp.json'] = json({ mcpServers: { gamedevpl_cli: server } });
  }
  if (target === 'vibe') {
    files['plugin.json'] = json({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', ...metadata });
    files['mcp.json'] = json({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: {
        gamedevpl_cli: {
          type: 'stdio',
          command: 'node',
          args: ['${PLUGIN_ROOT}/mcp.mjs'],
          env: { GAMEDEV_CREATOR_KEY_FILE: join(source, '../../creator-key') },
        },
      },
    });
  }
  if (target === 'muse')
    files['.muse-plugin/plugin.json'] = json({
      schemaVersion: 1,
      name: PLUGIN_NAME,
      displayName: 'Gamedev.pl',
      version: CLI_VERSION,
      description: metadata.description,
      capabilities: { skills: [{ id: 'gamedevpl', path: 'skills/gamedevpl/SKILL.md', enabledDefault: true }] },
    });
  if (target === 'gemini')
    files['gemini-extension.json'] = json({
      name: PLUGIN_NAME,
      version: CLI_VERSION,
      mcpServers: { gamedevpl_cli: server },
      settings: [{ name: 'Gamedev.pl creator key', envVar: 'GAMEDEV_CREATOR_KEY', sensitive: true }],
    });
  if (target === 'opencode')
    files['index.mjs'] = Buffer.from(
      `export const Gamedevpl = async () => ({ config: async (config) => {\n` +
        `  config.mcp ??= {};\n` +
        `  if (config.mcp.gamedevpl || config.mcp.gamedevpl_cli) return;\n` +
        `  config.mcp.gamedevpl_cli = ${JSON.stringify({ type: 'local', command: [process.execPath, join(source, 'mcp.mjs')], enabled: true })};\n` +
        `  config.skills ??= {}; config.skills.paths ??= [];\n` +
        `  const path = ${JSON.stringify(join(source, 'skills'))};\n` +
        `  if (!config.skills.paths.includes(path)) config.skills.paths.push(path);\n` +
        `} });\n`,
    );
  return Object.fromEntries(
    Object.entries(files).map(([path, bytes]) => [path.endsWith('/marketplace.json') ? path : `plugin/${path}`, bytes]),
  );
}
