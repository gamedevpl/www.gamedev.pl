import { spawnSync } from 'node:child_process';
import { CliError, EXIT_AUTH } from './exit-codes.js';

// Keep subscription login; never inherit a separately billed API or cloud provider.
export function subscriptionEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...parent };
  for (const key of Object.keys(env)) {
    if (/^ANTHROPIC_|^CLAUDE_CODE_USE_|^CLAUDE_CODE_API_KEY/.test(key)) delete env[key];
  }
  return env;
}

export function requireClaudeSubscription(input: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  args?: string[];
}): void {
  const configArgs: string[] = [];
  for (let i = 0; i < (input.args?.length ?? 0); i++) {
    const arg = input.args![i]!;
    if (/^--(settings|setting-sources|profile)(=|$)/.test(arg)) {
      configArgs.push(arg);
      if (!arg.includes('=') && input.args![i + 1]) configArgs.push(input.args![++i]!);
    }
    if (arg === '--bare') configArgs.push(arg);
  }
  const result = spawnSync(input.command, [...configArgs, 'auth', 'status', '--json'], {
    cwd: input.cwd,
    env: input.env,
    encoding: 'utf8',
    timeout: 15_000,
    killSignal: 'SIGKILL',
    windowsHide: true,
  });
  let status: { loggedIn?: boolean; authMethod?: string; apiProvider?: string } = {};
  try {
    const parsed: unknown = JSON.parse(result.stdout ?? '');
    if (parsed && typeof parsed === 'object') status = parsed as typeof status;
  } catch {
    // Unknown auth must never fall back to API billing.
  }
  if (
    result.status !== 0 ||
    !status.loggedIn ||
    status.authMethod !== 'claude.ai' ||
    status.apiProvider !== 'firstParty'
  ) {
    throw new CliError(
      'Claude subscription login could not be verified; no agent was started and API billing is disabled.',
      EXIT_AUTH,
      'Sign in with your Claude subscription using claude auth login; remove API overrides from Claude settings, then retry.',
    );
  }
}
