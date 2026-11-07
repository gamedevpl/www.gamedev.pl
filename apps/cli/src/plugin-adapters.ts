import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { noSymlinks, pluginTrees } from './plugin-files.js';
import { PLUGIN_NAME, PLUGIN_MARKET, type PluginTarget } from './plugin-packages.js';

export type PluginRunner = (command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) => string;
export const runPluginTool: PluginRunner = (command, args, env, cwd) => {
  const clientEnv = { ...env };
  delete clientEnv.GAMEDEV_TOKEN;
  delete clientEnv.GAMEDEV_TOKEN_FILE;
  try {
    const trustPrompt = command === 'gemini' && args[0] === 'extensions' && args[1] === 'install';
    return (
      execFileSync(command, args, {
        env: clientEnv,
        cwd,
        encoding: 'utf8',
        timeout: 120_000,
        maxBuffer: 4_000_000,
        stdio: trustPrompt ? ['inherit', 2, 2] : ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }) ?? ''
    );
  } catch {
    throw new CliError(
      `${command} ${args.slice(0, 2).join(' ')} failed; check the client's version and plugin settings`,
      EXIT_REFUSED,
    );
  }
};

export function pluginLayout(target: PluginTarget, env: NodeJS.ProcessEnv) {
  const home = resolve(env.HOME ?? homedir());
  const config = resolve(env.XDG_CONFIG_HOME ?? join(home, '.config'));
  const claude = resolve(env.CLAUDE_CONFIG_DIR ?? join(home, '.claude'));
  const codex = resolve(env.CODEX_HOME ?? join(home, '.codex'));
  const copilot = resolve(env.COPILOT_HOME ?? join(home, '.copilot'));
  const gemini = join(home, '.gemini');
  const cursor = join(home, '.cursor');
  const opencode = join(config, 'opencode');
  const roots = {
    claude: [join(claude, 'plugins/cache')],
    codex: [join(codex, 'plugins/cache')],
    copilot: [join(copilot, 'installed-plugins')],
    antigravity: [join(gemini, 'config/plugins')],
    cursor: [join(cursor, 'plugins/local')],
    gemini: [join(gemini, 'extensions')],
    opencode: [],
  }[target];
  const configs = {
    claude: [join(home, '.claude.json'), join(claude, 'settings.json')],
    codex: [join(codex, 'config.toml')],
    copilot: [join(copilot, 'mcp-config.json')],
    antigravity: [join(gemini, 'antigravity/mcp_config.json')],
    cursor: [join(cursor, 'mcp.json')],
    gemini: [join(gemini, 'settings.json')],
    opencode: [env.OPENCODE_CONFIG ?? join(opencode, 'opencode.json'), join(opencode, 'opencode.jsonc')],
  }[target];
  const direct =
    target === 'cursor'
      ? join(cursor, 'plugins/local', PLUGIN_NAME)
      : target === 'opencode'
        ? join(opencode, 'plugins', `${PLUGIN_NAME}.js`)
        : undefined;
  return { home, state: join(config, 'gamedevpl/plugins', target), roots, configs, direct };
}

export function existingIntegration(target: PluginTarget, env: NodeJS.ProcessEnv): boolean {
  const layout = pluginLayout(target, env);
  if (layout.direct && existsSync(layout.direct)) return true;
  if (pluginTrees(layout.roots, [PLUGIN_NAME, 'gamedev-pl', 'gamedevpl']).length) return true;
  for (const file of layout.configs) {
    noSymlinks(file);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (text.includes('www.gamedev.pl/api/mcp')) return true;
    if (/["']gamedevpl(?:_cli)?["']\s*:/.test(text) || /\[mcp_servers\.(?:"|')?gamedevpl(?:_cli)?(?:"|')?\]/.test(text))
      return true;
  }
  return false;
}

export function nativePluginCommands(
  target: PluginTarget,
  source: string,
  action: 'install' | 'uninstall',
): string[][] {
  const plugin = join(source, 'plugin');
  if (target === 'cursor' || target === 'opencode') return [];
  if (target === 'claude')
    return action === 'install'
      ? [
          ['claude', 'plugin', 'marketplace', 'add', source, '--scope', 'user'],
          ['claude', 'plugin', 'install', `${PLUGIN_NAME}@${PLUGIN_MARKET}`, '--scope', 'user'],
        ]
      : [['claude', 'plugin', 'uninstall', `${PLUGIN_NAME}@${PLUGIN_MARKET}`, '--scope', 'user']];
  if (target === 'codex')
    return action === 'install'
      ? [
          ['codex', 'plugin', 'marketplace', 'add', source],
          ['codex', 'plugin', 'add', `${PLUGIN_NAME}@${PLUGIN_MARKET}`],
        ]
      : [['codex', 'plugin', 'remove', `${PLUGIN_NAME}@${PLUGIN_MARKET}`]];
  if (target === 'gemini')
    return [
      [
        'gemini',
        'extensions',
        action,
        ...(action === 'install' ? [plugin, '--consent', '--skip-settings'] : [PLUGIN_NAME]),
      ],
    ];
  return [
    [target === 'antigravity' ? 'agy' : 'copilot', 'plugin', action, action === 'install' ? plugin : PLUGIN_NAME],
  ];
}

export function preflightPlugin(target: PluginTarget, env: NodeJS.ProcessEnv, cwd: string, run: PluginRunner): void {
  if (target === 'cursor' || target === 'opencode') return;
  if (target === 'codex' && env.CODEX_HOME) {
    noSymlinks(env.CODEX_HOME);
    mkdirSync(env.CODEX_HOME, { recursive: true, mode: 0o700 });
  }
  const command = target === 'antigravity' ? 'agy' : target;
  const feature = target === 'gemini' ? 'extensions' : 'plugin';
  const help = run(command, [feature, '--help'], env, cwd);
  if (!/install|add/.test(help) || !/uninstall|remove/.test(help))
    throw new CliError(`${command} lacks plugin installation/removal; update the client`, EXIT_REFUSED);
}
