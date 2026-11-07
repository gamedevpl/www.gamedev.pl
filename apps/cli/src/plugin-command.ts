import { managePlugins } from './plugins.js';
import { updatePlugins, configurePlugin } from './plugin-update.js';

export async function runPluginsCommand(
  args: string[],
  flags: Record<string, string | boolean>,
  env: NodeJS.ProcessEnv,
  stdout: { write(value: string): unknown },
): Promise<number> {
  const action = args[0];
  const result =
    action === 'update'
      ? await updatePlugins({ args: args.slice(1), flags, env, cwd: process.cwd() })
      : action === 'configure'
        ? await configurePlugin({ args: args.slice(1), flags, env })
        : await managePlugins({ args, flags, env, cwd: process.cwd() });
  if (flags.json) stdout.write(`${JSON.stringify(result)}\n`);
  else if ('plugins' in result && result.plugins)
    for (const plugin of result.plugins)
      stdout.write(
        `${plugin.target}: ${plugin.status}${'dryRun' in plugin && plugin.dryRun ? ' (dry run)' : ''}${'installedVersion' in plugin && plugin.installedVersion ? ` (${plugin.installedVersion})` : ''}${'updateAvailable' in plugin && plugin.updateAvailable ? ' — update available' : ''}${'error' in plugin && plugin.error ? ` — ${plugin.error}` : ''}\n`,
      );
  else if ('dryRun' in result) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    stdout.write(`${result.target}: ${result.status}${result.changed === false ? ' (unchanged)' : ''}\n`);
    if ('hint' in result && result.hint) stdout.write(`${result.hint}\n`);
    if (result.status === 'external') stdout.write('Existing integration preserved; this installer does not own it.\n');
  }
  return 'ok' in result && !result.ok ? 4 : 0;
}
