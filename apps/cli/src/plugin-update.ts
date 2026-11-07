import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { withCredentialLock } from './credential-lock.js';
import { noSymlinks, writePluginFile } from './plugin-files.js';
import { pluginLayout, nativePluginListing, runPluginTool, type PluginRunner } from './plugin-adapters.js';
import { PLUGIN_TARGETS, type PluginTarget } from './plugin-packages.js';
import { managePlugins, pluginStatus } from './plugins.js';

function flagsCheck(flags: Record<string, string | boolean>): void {
  if (Object.entries(flags).some(([key, value]) => !['json', 'dry-run'].includes(key) || typeof value !== 'boolean'))
    throw new CliError('plugins accepts only --json and --dry-run', EXIT_INPUT);
}

export async function updatePlugins(input: {
  args: string[];
  flags: Record<string, string | boolean>;
  env: NodeJS.ProcessEnv;
  cwd: string;
  run?: PluginRunner;
}) {
  flagsCheck(input.flags);
  const [name, ...extra] = input.args;
  if (extra.length || (name !== undefined && !(PLUGIN_TARGETS as readonly string[]).includes(name)))
    throw new CliError('Use gamedevpl plugins update [client].', EXIT_INPUT);
  const targets = name ? [name as PluginTarget] : [...PLUGIN_TARGETS];
  const plugins = [];
  let ok = true;
  for (const target of targets) {
    try {
      const state = pluginStatus(target, input.env);
      if (['modified', 'pending'].includes(state.status))
        throw new CliError(`${state.status} installation preserved; review plugins status first`, EXIT_REFUSED);
      if (!state.updateAvailable || input.flags['dry-run']) {
        plugins.push({ ...state, changed: false, dryRun: input.flags['dry-run'] === true });
        continue;
      }
      const native = nativePluginListing(
        target,
        input.env,
        pluginLayout(target, input.env).home,
        input.run ?? runPluginTool,
      );
      if (native.disabled)
        throw new CliError('Native client reports disabled plugin configuration; preserved for review', EXIT_REFUSED);
      await managePlugins({ ...input, args: ['uninstall', target] });
      const installed = await managePlugins({ ...input, args: ['install', target] });
      const after = pluginStatus(target, input.env);
      if (after.status !== 'installed' || after.updateAvailable)
        throw new CliError('installation changed during update; preserved for review', EXIT_REFUSED);
      plugins.push({ ...installed, ...after, changed: 'changed' in installed ? installed.changed : false });
    } catch (error) {
      ok = false;
      let status: string;
      try {
        status = pluginStatus(target, input.env).status;
      } catch {
        status = 'unknown';
      }
      plugins.push({
        target,
        status,
        updated: false,
        error: error instanceof Error ? error.message : 'update failed',
      });
    }
  }
  return { plugins, ok };
}

export async function configurePlugin(input: {
  args: string[];
  flags: Record<string, string | boolean>;
  env: NodeJS.ProcessEnv;
}) {
  flagsCheck(input.flags);
  if (input.args.length !== 1 || input.args[0] !== 'vibe')
    throw new CliError('Use gamedevpl plugins configure vibe with GAMEDEV_CREATOR_KEY set.', EXIT_INPUT);
  const layout = pluginLayout('vibe', input.env);
  const file = join(layout.state, 'creator-key');
  if (input.flags['dry-run']) return { target: 'vibe', status: 'configure', dryRun: true, credentialFile: file };
  const lock = join(layout.state, '../../plugin-manager');
  noSymlinks(lock);
  return withCredentialLock(lock, async () => {
    if (pluginStatus('vibe', input.env).status !== 'installed')
      throw new CliError('Install an unchanged CLI-owned Vibe plugin before configuring its key', EXIT_REFUSED);
    const key = input.env.GAMEDEV_CREATOR_KEY?.trim();
    if (!key || key.length > 4096 || /\s/.test(key) || key.startsWith('${'))
      throw new CliError('Set GAMEDEV_CREATOR_KEY to the coding-agent key value, then retry', EXIT_INPUT);
    noSymlinks(file);
    if (existsSync(file) && readFileSync(file, 'utf8') === key && (lstatSync(file).mode & 0o077) === 0)
      return { target: 'vibe', status: 'configured', changed: false };
    writePluginFile(file, key);
    return {
      target: 'vibe',
      status: 'configured',
      changed: true,
      hint: 'Creator key saved privately. Restart Vibe to load the MCP connection.',
    };
  });
}
