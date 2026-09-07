import { execFile } from 'node:child_process';
import { CliError, EXIT_AUTH } from './exit-codes.js';

// Keep subscription login; never inherit a separately billed API or cloud provider.
export function subscriptionEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...parent };
  for (const key of Object.keys(env)) {
    if (
      [
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_AUTH_TOKEN',
        'ANTHROPIC_BASE_URL',
        'ANTHROPIC_CUSTOM_HEADERS',
        'CLAUDE_CODE_USE_BEDROCK',
        'CLAUDE_CODE_USE_VERTEX',
        'CLAUDE_CODE_USE_FOUNDRY',
        'CLAUDE_CODE_API_KEY',
      ].includes(key)
    )
      delete env[key];
  }
  return env;
}

export async function requireClaudeSubscription(input: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  args?: string[];
  abort?: AbortSignal;
}): Promise<void> {
  const configArgs: string[] = [];
  for (let i = 0; i < (input.args?.length ?? 0); i++) {
    const arg = input.args![i]!;
    if (/^--(settings|setting-sources|profile)(=|$)/.test(arg)) {
      configArgs.push(arg);
      if (!arg.includes('=') && input.args![i + 1]) configArgs.push(input.args![++i]!);
    }
    if (arg === '--bare') configArgs.push(arg);
  }
  const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      input.command,
      [...configArgs, 'auth', 'status', '--json'],
      {
        cwd: input.cwd,
        env: input.env,
        encoding: 'utf8',
        timeout: 15_000,
        killSignal: 'SIGKILL',
        windowsHide: true,
        signal: input.abort,
      },
      (error, stdout, stderr) => {
        if (input.abort?.aborted) {
          reject(new CliError('Claude authentication check cancelled.', EXIT_AUTH));
          return;
        }
        resolve({ code: error ? 1 : 0, stdout, stderr });
      },
    );
  });
  if (
    result.code !== 0 &&
    /unknown (command|option)|unrecognized (command|option)/i.test(result.stderr + result.stdout)
  ) {
    throw new CliError(
      'This Claude Code version cannot report authentication status.',
      EXIT_AUTH,
      'Update Claude Code, then retry. No agent was started.',
    );
  }
  let status: { loggedIn?: boolean; authMethod?: string; apiProvider?: string } = {};
  try {
    const parsed: unknown = JSON.parse(result.stdout ?? '');
    if (parsed && typeof parsed === 'object') status = parsed as typeof status;
  } catch {
    // Unknown auth must never fall back to API billing.
  }
  if (
    result.code !== 0 ||
    status.loggedIn !== true ||
    !['claude.ai', 'oauth_token'].includes(status.authMethod ?? '') ||
    status.apiProvider !== 'firstParty'
  ) {
    throw new CliError(
      'Claude subscription login could not be verified; no agent was started and API billing is disabled.',
      EXIT_AUTH,
      'Sign in with your Claude subscription using claude auth login; remove API overrides from Claude settings, then retry.',
    );
  }
}
