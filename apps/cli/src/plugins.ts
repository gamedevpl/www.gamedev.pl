import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { withCredentialLock } from './credential-lock.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { pluginFiles, PLUGIN_NAME, PLUGIN_MARKET, PLUGIN_TARGETS, type PluginTarget } from './plugin-packages.js';
import { claimPluginPath, noSymlinks, pluginTrees, treeDigest, writePluginFile } from './plugin-files.js';
import {
  existingIntegration,
  nativePluginCommands,
  pluginLayout,
  preflightPlugin,
  runPluginTool,
  type PluginRunner,
} from './plugin-adapters.js';

interface Receipt {
  version: 1;
  phase: 'pending' | 'installed';
  sourceDigest: string;
  trees: Record<string, string>;
  marketplace?: boolean;
}

function readReceipt(file: string): Receipt | undefined {
  noSymlinks(file);
  if (!existsSync(file)) return;
  const value = JSON.parse(readFileSync(file, 'utf8')) as Receipt;
  if (
    value.version !== 1 ||
    !['pending', 'installed'].includes(value.phase) ||
    typeof value.sourceDigest !== 'string' ||
    !value.trees ||
    typeof value.trees !== 'object'
  )
    throw new CliError('invalid plugin ownership receipt; refusing to change installation', EXIT_REFUSED);
  return value;
}

function installedTrees(target: PluginTarget, env: NodeJS.ProcessEnv): string[] {
  const layout = pluginLayout(target, env);
  return layout.direct ? (existsSync(layout.direct) ? [layout.direct] : []) : pluginTrees(layout.roots, [PLUGIN_NAME]);
}

function unchanged(target: PluginTarget, env: NodeJS.ProcessEnv, receipt: Receipt): boolean {
  const layout = pluginLayout(target, env);
  const source = join(layout.state, 'source');
  if (!existsSync(source) || treeDigest(source) !== receipt.sourceDigest) return false;
  const trees = installedTrees(target, env);
  return (
    JSON.stringify(trees) === JSON.stringify(Object.keys(receipt.trees).sort()) &&
    trees.every((path) => treeDigest(path) === receipt.trees[path])
  );
}

export function pluginStatus(target: PluginTarget, env: NodeJS.ProcessEnv) {
  const layout = pluginLayout(target, env);
  const receipt = readReceipt(join(layout.state, 'receipt.json'));
  const removedByClient =
    receipt &&
    Object.keys(receipt.trees).length > 0 &&
    Object.keys(receipt.trees).every((path) => !existsSync(path)) &&
    installedTrees(target, env).length === 0 &&
    existsSync(join(layout.state, 'source')) &&
    treeDigest(join(layout.state, 'source')) === receipt.sourceDigest;
  const status = receipt
    ? unchanged(target, env, receipt)
      ? receipt.phase
      : removedByClient
        ? 'pending'
        : 'modified'
    : existingIntegration(target, env)
      ? 'external'
      : 'absent';
  return { target, status };
}

export async function managePlugins(input: {
  args: string[];
  flags: Record<string, string | boolean>;
  env: NodeJS.ProcessEnv;
  cwd: string;
  run?: PluginRunner;
}) {
  const [action = 'status', name, ...extra] = input.args;
  if (
    !['install', 'uninstall', 'status'].includes(action) ||
    extra.length ||
    (name !== undefined && !(PLUGIN_TARGETS as readonly string[]).includes(name)) ||
    (action !== 'status' && !name)
  )
    throw new CliError(
      `Use gamedevpl plugins install|uninstall <${PLUGIN_TARGETS.join('|')}> or plugins status [client].`,
      EXIT_INPUT,
    );
  if (
    Object.entries(input.flags).some(
      ([flag, value]) => !['json', 'dry-run'].includes(flag) || typeof value !== 'boolean',
    )
  )
    throw new CliError('plugins accepts only --json and --dry-run', EXIT_INPUT);
  const targets = name ? [name as PluginTarget] : [...PLUGIN_TARGETS];
  if (action === 'status') return { plugins: targets.map((target) => pluginStatus(target, input.env)) };
  const target = targets[0]!;
  const layout = pluginLayout(target, input.env);
  const source = join(layout.state, 'source');
  const receiptFile = join(layout.state, 'receipt.json');
  const plan = {
    target,
    action,
    commands: nativePluginCommands(target, source, action as 'install' | 'uninstall'),
    localPath: layout.direct,
  };
  if (input.flags['dry-run'] === true) return { ...plan, dryRun: true, ...pluginStatus(target, input.env) };
  const run = input.run ?? runPluginTool;
  const lockRoot = join(input.env.XDG_CONFIG_HOME ?? join(input.env.HOME ?? homedir(), '.config'), 'gamedevpl');
  noSymlinks(join(lockRoot, 'plugin-manager'));
  return withCredentialLock(join(lockRoot, 'plugin-manager'), async () => {
    const current = pluginStatus(target, input.env);
    if (action === 'install' && ['external', 'installed'].includes(current.status))
      return { ...current, changed: false };
    if (current.status === 'modified')
      throw new CliError(
        'plugin files changed outside gamedevpl; review them before installing or uninstalling',
        EXIT_REFUSED,
      );
    if (action === 'uninstall' && !['installed', 'pending'].includes(current.status))
      return { ...current, changed: false };
    preflightPlugin(target, input.env, layout.home, run);
    if (action === 'install') {
      if (current.status === 'pending')
        throw new CliError('previous installation is incomplete; run plugins uninstall first', EXIT_REFUSED);
      if (existsSync(source))
        throw new CliError('unowned plugin source directory exists; refusing to replace it', EXIT_REFUSED);
      if (target === 'claude' || target === 'codex') {
        const listing = run(target, ['plugin', 'marketplace', 'list', '--json'], input.env, layout.home);
        if (listing.includes(PLUGIN_MARKET))
          throw new CliError('bundled marketplace already exists outside this installer', EXIT_REFUSED);
      }
      const files = pluginFiles(target, join(source, 'plugin'));
      claimPluginPath(source);
      for (const [path, bytes] of Object.entries(files)) writePluginFile(join(source, path), bytes);
      const receipt: Receipt = { version: 1, phase: 'pending', sourceDigest: treeDigest(source), trees: {} };
      writePluginFile(receiptFile, JSON.stringify(receipt));
      try {
        if (target === 'cursor') {
          claimPluginPath(layout.direct!);
          for (const [path, bytes] of Object.entries(files))
            writePluginFile(join(layout.direct!, path.replace(/^plugin\//, '')), bytes);
        } else if (target === 'opencode') claimPluginPath(layout.direct!, files['plugin/index.mjs']!);
        else
          for (const [command, ...args] of plan.commands) {
            run(command!, args, input.env, layout.state);
            if (args[0] === 'plugin' && args[1] === 'marketplace') {
              receipt.marketplace = true;
              writePluginFile(receiptFile, JSON.stringify(receipt));
            }
          }
        const trees = installedTrees(target, input.env);
        receipt.trees = Object.fromEntries(trees.map((path) => [path, treeDigest(path)]));
        if (!trees.length)
          throw new CliError(
            'client did not expose an installed plugin directory; installation remains pending',
            EXIT_REFUSED,
          );
        receipt.phase = 'installed';
      } finally {
        receipt.trees = Object.fromEntries(installedTrees(target, input.env).map((path) => [path, treeDigest(path)]));
        writePluginFile(receiptFile, JSON.stringify(receipt));
      }
      return {
        target,
        status: 'installed',
        changed: true,
        hint: 'Set GAMEDEV_CREATOR_KEY in the client environment or its plugin settings, then restart the client.',
      };
    }
    const receipt = readReceipt(receiptFile)!;
    if (receipt.marketplace) {
      const listing = run(target, ['plugin', 'list', '--json'], input.env, layout.state);
      const names = [...listing.matchAll(/"([^"\s]+)@gamedevpl-cli-bundled"/g)].map((match) => match[1]);
      if (names.some((name) => name !== PLUGIN_NAME))
        throw new CliError(
          'bundled marketplace has other plugins; refusing to remove shared configuration',
          EXIT_REFUSED,
        );
    }
    if (installedTrees(target, input.env).length)
      for (const [command, ...args] of plan.commands) run(command!, args, input.env, layout.state);
    if (layout.direct) {
      noSymlinks(layout.direct);
      rmSync(layout.direct, { recursive: target === 'cursor', force: true });
    }
    receipt.phase = 'pending';
    receipt.trees = {};
    writePluginFile(receiptFile, JSON.stringify(receipt));
    if (receipt.marketplace) {
      run(
        target,
        ['plugin', 'marketplace', 'remove', PLUGIN_MARKET, ...(target === 'claude' ? ['--scope', 'user'] : [])],
        input.env,
        layout.state,
      );
    }
    noSymlinks(source);
    rmSync(source, { recursive: true });
    rmSync(receiptFile);
    return { target, status: 'absent', changed: true };
  });
}

export async function runPluginsCommand(
  args: string[],
  flags: Record<string, string | boolean>,
  env: NodeJS.ProcessEnv,
  stdout: { write(value: string): unknown },
): Promise<number> {
  const result = await managePlugins({ args, flags, env, cwd: process.cwd() });
  if (flags.json) stdout.write(`${JSON.stringify(result)}\n`);
  else if ('plugins' in result && result.plugins)
    for (const plugin of result.plugins) stdout.write(`${plugin.target}: ${plugin.status}\n`);
  else if ('dryRun' in result) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    stdout.write(`${result.target}: ${result.status}${result.changed === false ? ' (unchanged)' : ''}\n`);
    if ('hint' in result && result.hint) stdout.write(`${result.hint}\n`);
    if (result.status === 'external') stdout.write('Existing integration preserved; this installer does not own it.\n');
  }
  return 0;
}
