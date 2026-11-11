import { execFileSync, spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
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
  if (command === 'muse' && args[0] === 'plugins')
    clientEnv.XDG_CONFIG_HOME = join(pluginLayout('muse', env).state, 'native-config');
  try {
    if (command === 'gemini' && args[0] === 'extensions' && args[1] === 'list') {
      const listed = spawnSync(command, args, {
        env: clientEnv,
        cwd,
        encoding: 'utf8',
        timeout: 120_000,
        maxBuffer: 4_000_000,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      if (listed.error || listed.status !== 0) throw new Error('extension list failed');
      return `${listed.stdout ?? ''}\n${listed.stderr ?? ''}`;
    }
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
  const vibe = resolve(env.VIBE_HOME ?? join(home, '.vibe'));
  const data = resolve(env.XDG_DATA_HOME ?? join(home, '.local/share'));
  const roots = {
    claude: [join(claude, 'plugins/cache')],
    codex: [join(codex, 'plugins/cache')],
    copilot: [join(copilot, 'installed-plugins')],
    antigravity: [join(gemini, 'config/plugins')],
    cursor: [join(cursor, 'plugins/local')],
    gemini: [join(gemini, 'extensions')],
    opencode: [],
    vibe: [join(vibe, 'plugins')],
    muse: [join(data, 'muse/plugins/cache/local')],
  }[target];
  const configs = {
    claude: [join(home, '.claude.json'), join(claude, 'settings.json')],
    codex: [join(codex, 'config.toml')],
    copilot: [join(copilot, 'mcp-config.json')],
    antigravity: [join(gemini, 'antigravity/mcp_config.json')],
    cursor: [join(cursor, 'mcp.json')],
    gemini: [join(gemini, 'settings.json')],
    vibe: [join(vibe, 'config.toml')],
    muse: [join(config, 'muse/settings.json')],
    opencode: [env.OPENCODE_CONFIG ?? join(opencode, 'opencode.json'), join(opencode, 'opencode.jsonc')],
  }[target];
  const direct =
    target === 'cursor'
      ? join(cursor, 'plugins/local', PLUGIN_NAME)
      : target === 'vibe'
        ? join(vibe, 'plugins', PLUGIN_NAME)
        : target === 'opencode'
          ? join(opencode, 'plugins', `${PLUGIN_NAME}.js`)
          : undefined;
  return { home, state: join(config, 'gamedevpl/plugins', target), roots, configs, direct };
}

export type IntegrationEvidence = { kind: 'plugin' | 'mcp'; path: string };

export function existingIntegrations(target: PluginTarget, env: NodeJS.ProcessEnv): IntegrationEvidence[] {
  const layout = pluginLayout(target, env);
  const found: IntegrationEvidence[] = [];
  if (layout.direct && existsSync(layout.direct)) found.push({ kind: 'plugin', path: layout.direct });
  try {
    if (target === 'muse') {
      const registry = join(layout.roots[0]!, '../../installed.json');
      noSymlinks(registry);
      if (existsSync(registry) && /"gamedevpl(?:-cli)?"/.test(readFileSync(registry, 'utf8')))
        found.push({ kind: 'plugin', path: registry });
    }
    for (const path of pluginTrees(layout.roots, [PLUGIN_NAME, 'gamedev-pl', 'gamedevpl'], { slots: true }))
      if (!found.some((entry) => entry.path === path)) found.push({ kind: 'plugin', path });
    for (const file of layout.configs) {
      noSymlinks(file);
      if (!existsSync(file)) continue;
      const text = readFileSync(file, 'utf8');
      if (
        text.includes('www.gamedev.pl/api/mcp') ||
        (target === 'vibe' && /^\s*name\s*=\s*["']gamedevpl(?:[-_]cli)?["']\s*$/m.test(text)) ||
        /["']gamedevpl(?:_cli)?["']\s*:/.test(text) ||
        /\[mcp_servers\.(?:"|')?gamedevpl(?:_cli)?(?:"|')?\]/.test(text)
      )
        found.push({ kind: 'mcp', path: file });
    }
  } catch (error) {
    if (!found.length) throw error;
  }
  return found;
}

export function existingIntegration(target: PluginTarget, env: NodeJS.ProcessEnv): boolean {
  return existingIntegrations(target, env).length > 0;
}

export function nativePluginCommands(
  target: PluginTarget,
  source: string,
  action: 'install' | 'uninstall',
): string[][] {
  const plugin = join(source, 'plugin');
  if (target === 'cursor' || target === 'opencode' || target === 'vibe') return [];
  if (target === 'muse')
    return [
      [
        'muse',
        'plugins',
        action === 'install' ? 'install' : 'remove',
        action === 'install' ? plugin : PLUGIN_NAME,
        '--json',
      ],
    ];
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

function geminiScopedDisablement(env: NodeJS.ProcessEnv): boolean {
  const file = join(pluginLayout('gemini', env).roots[0]!, 'extension-enablement.json');
  noSymlinks(file);
  if (!existsSync(file)) return false;
  const config = JSON.parse(readFileSync(file, 'utf8')) as Record<string, { overrides?: unknown }>;
  const own = config[PLUGIN_NAME];
  if (own === undefined) return false;
  if (!own || !Array.isArray(own.overrides) || own.overrides.some((rule) => typeof rule !== 'string'))
    throw new CliError('unknown Gemini enablement rules; preserving the installation', EXIT_REFUSED);
  return own.overrides.some((rule: string) => rule.startsWith('!'));
}

export function nativePluginListing(target: PluginTarget, env: NodeJS.ProcessEnv, cwd: string, run: PluginRunner) {
  if (target === 'cursor' || target === 'opencode' || target === 'vibe')
    return { text: '[]', registered: false, disabled: false };
  const command = target === 'antigravity' ? 'agy' : target;
  const text = run(
    command,
    target === 'gemini' ? ['extensions', 'list'] : [target === 'muse' ? 'plugins' : 'plugin', 'list', '--json'],
    env,
    cwd,
  );
  if (target === 'gemini') {
    const clean = stripVTControlCharacters(text).trim();
    const blocks = clean.split(/(?=^[✓✗]\s+\S+\s+\()/m).filter((block) => /^[✓✗]\s+/.test(block));
    if (!blocks.length && !/^No extensions installed\.?$/i.test(clean))
      throw new CliError('client returned an unknown extension list format; refusing to change it', EXIT_REFUSED);
    const own = blocks.find((block) => new RegExp(`^[✓✗]\\s+${PLUGIN_NAME}\\s+\\(`).test(block));
    return {
      text,
      registered: own !== undefined,
      disabled: geminiScopedDisablement(env) || (own !== undefined && /^\s*Enabled[^\n:]*:\s*false\s*$/im.test(own)),
    };
  }
  const parsed = JSON.parse(text) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : (parsed as { installed?: unknown[]; plugins?: unknown[] })[target === 'muse' ? 'plugins' : 'installed'];
  if (!Array.isArray(rows)) throw new CliError('client returned an unknown plugin list format', EXIT_REFUSED);
  const own = rows.filter(
    (row: { name?: string; id?: string; pluginId?: string }) =>
      row.name === PLUGIN_NAME ||
      row.id === PLUGIN_NAME ||
      row.id === `${PLUGIN_NAME}@${PLUGIN_MARKET}` ||
      row.pluginId === `${PLUGIN_NAME}@${PLUGIN_MARKET}`,
  );
  return {
    text,
    registered: own.length > 0,
    disabled: own.some(
      (row: { enabled?: boolean; disabled?: boolean; status?: string }) =>
        row.enabled === false || row.disabled === true || row.status === 'disabled',
    ),
  };
}

export function ownedMarketplace(
  target: PluginTarget,
  source: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
  run: PluginRunner,
): boolean {
  const parsed = JSON.parse(run(target, ['plugin', 'marketplace', 'list', '--json'], env, cwd));
  const rows = Array.isArray(parsed) ? parsed : parsed?.marketplaces;
  if (!Array.isArray(rows)) throw new CliError('client returned an unknown marketplace list format', EXIT_REFUSED);
  const entry = rows.find((row: { name?: string }) => row.name === PLUGIN_MARKET);
  if (!entry) return false;
  const path = target === 'claude' ? entry.path : entry.root;
  if (typeof path !== 'string' || resolve(path) !== resolve(source))
    throw new CliError('marketplace no longer points at this installation; refusing to change it', EXIT_REFUSED);
  return true;
}

export function preflightPlugin(target: PluginTarget, env: NodeJS.ProcessEnv, cwd: string, run: PluginRunner): void {
  if (target === 'cursor' || target === 'opencode' || target === 'vibe') return;
  if (target === 'codex' && env.CODEX_HOME) {
    noSymlinks(env.CODEX_HOME);
    mkdirSync(env.CODEX_HOME, { recursive: true, mode: 0o700 });
  }
  const command = target === 'antigravity' ? 'agy' : target;
  const feature = target === 'gemini' ? 'extensions' : target === 'muse' ? 'plugins' : 'plugin';
  const help = run(command, [feature, '--help'], env, cwd);
  if (!/install|add/.test(help) || !/uninstall|remove/.test(help))
    throw new CliError(`${command} lacks plugin installation/removal; update the client`, EXIT_REFUSED);
}
