import { realpathSync } from 'node:fs';
import * as z from 'zod';
import type { AppAction, AppTool } from 'genaicode/app-agent';
import { spawnCommand } from './delegate.js';
import { stripTerminalControls } from './ansi.js';

const pushSchema = z
  .object({
    remote: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
      .max(200),
    remoteUrl: z.string().min(1).max(2048),
    branch: z.string().min(1).max(1024),
    commit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  })
  .strict();

export function gitPushActionSummary(action: AppAction): string {
  return action.tool?.name === 'game_git_push'
    ? `${action.summary}\n${JSON.stringify(action.tool.args, null, 2)}`
    : action.summary;
}

export function playGitPushTool(input: {
  root: string;
  env?: NodeJS.ProcessEnv;
  abort: () => AbortSignal;
  write: (line: string) => void;
  writer?: <T>(run: () => Promise<T>) => Promise<T>;
}): AppTool {
  const run = async (raw: Record<string, unknown>) => {
    const args = pushSchema.parse(raw);
    const signal = input.abort();
    const git = async (args: string[], timeoutMs = 10_000) => {
      signal.throwIfAborted();
      return new Promise<string>((resolve, reject) => {
        let timedOut = false;
        const child = spawnCommand({
          command: 'git',
          args,
          cwd: input.root,
          env: { ...(input.env ?? process.env), GIT_TERMINAL_PROMPT: '0' },
          abort: signal,
          timeoutMs,
          onTimeout: () => (timedOut = true),
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk: Buffer) => (stdout = (stdout + chunk.toString()).slice(-65_536)));
        child.stderr?.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-65_536)));
        child.once('error', reject);
        child.once('close', (code) => {
          if (signal.aborted) reject(new Error('Git push cancelled; check the remote before retrying.'));
          else if (timedOut) reject(new Error('Git timed out; check the remote before retrying the push.'));
          else if (code !== 0) reject(new Error(stripTerminalControls(stderr || stdout || 'Git failed.').trim()));
          else resolve(stdout.trim());
        });
      });
    };
    if (realpathSync(await git(['rev-parse', '--show-toplevel'])) !== realpathSync(input.root))
      throw Error('Git repository root does not match this Play checkout.');
    await git(['check-ref-format', `refs/heads/${args.branch}`]);
    const urls = (await git(['remote', 'get-url', '--push', '--all', args.remote])).split('\n');
    if (urls.length !== 1 || urls[0] !== args.remoteUrl)
      throw Error('The push destination changed or has multiple URLs. Inspect the remote and request approval again.');
    if ((await git(['rev-parse', '--verify', `refs/heads/${args.branch}^{commit}`])) !== args.commit)
      throw Error('The branch changed. Inspect its new commit and request approval again.');
    input.write(`Pushing ${args.commit.slice(0, 12)} to ${args.remote}/${args.branch}…`);
    const output = await git(
      [
        '-c',
        `remote.${args.remote}.mirror=false`,
        'push',
        '--porcelain',
        '--no-force',
        '--no-follow-tags',
        '--no-mirror',
        '--recurse-submodules=no',
        '--',
        args.remote,
        `${args.commit}:refs/heads/${args.branch}`,
      ],
      60_000,
    );
    return stripTerminalControls(output);
  };
  return {
    name: 'game_git_push',
    description:
      'Push a committed local branch through the CLI host, using the creator’s normal Git/SSH credentials even when the agent shell cannot use SSH. Only when the creator asked to push. Inspect git remote get-url --push --all REMOTE and git rev-parse refs/heads/BRANCH first; pass that exact URL and full commit SHA. Include the remote, branch and commit in approval_summary. Requires approval in Play; refuses changed branches/destinations, force pushes, deletions and multiple push URLs. Does not commit files or publish on gamedev.pl.',
    write: true,
    inputSchema: {
      type: 'object',
      properties: {
        remote: { type: 'string', description: 'Configured remote name, usually origin.' },
        remoteUrl: { type: 'string', description: 'Exact resolved push URL from git remote get-url --push --all.' },
        branch: { type: 'string', description: 'Local and destination branch name, without refs/heads/.' },
        commit: { type: 'string', description: 'Full commit SHA currently at refs/heads/BRANCH.' },
      },
      required: ['remote', 'remoteUrl', 'branch', 'commit'],
      additionalProperties: false,
    },
    validate: (args) => {
      pushSchema.parse(args);
    },
    run: (args) => (input.writer ? input.writer(() => run(args)) : run(args)),
  };
}
