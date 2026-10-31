import { copyFileSync, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import type { AppAction, AppTool } from 'genaicode/app-agent';
import { spawnCommand } from './delegate.js';
import { stripTerminalControls } from './ansi.js';

function hostPushUrl(url: string): boolean {
  if (/^gamedevpl:/i.test(url) || /\s/.test(url) || stripTerminalControls(url) !== url) return false;
  if (/^(https|ssh):\/\//.test(url)) {
    try {
      return Boolean(new URL(url).hostname);
    } catch {
      return false;
    }
  }
  return !url.includes('://') && /^(?:[a-zA-Z0-9_.-]+@)?(?:[a-zA-Z0-9][a-zA-Z0-9.-]*|\[[a-fA-F0-9:]+\]):[^:]/.test(url);
}

const pushSchema = z
  .object({
    remote: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
      .max(200),
    remoteUrl: z
      .string()
      .min(1)
      .max(2048)
      .refine(
        hostPushUrl,
        'Host pushes require an SSH or HTTPS URL. Platform remotes use the gamedev.pl delivery flow.',
      ),
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
    const hostEnv = { ...(input.env ?? process.env) };
    for (const key of [
      'GIT_DIR',
      'GIT_COMMON_DIR',
      'GIT_WORK_TREE',
      'GIT_INDEX_FILE',
      'GIT_OBJECT_DIRECTORY',
      'GIT_ALTERNATE_OBJECT_DIRECTORIES',
      'GIT_NAMESPACE',
      'GIT_SHALLOW_FILE',
    ])
      delete hostEnv[key];
    const isolated = mkdtempSync(join(tmpdir(), 'gamedevpl-push-'));
    const env = { ...hostEnv, GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' };
    const git = async (args: string[], timeoutMs = 10_000, cwd = input.root, extraEnv: NodeJS.ProcessEnv = {}) => {
      signal.throwIfAborted();
      return new Promise<string>((resolve, reject) => {
        let timedOut = false;
        const child = spawnCommand({
          command: 'git',
          args: ['-c', `core.hooksPath=${join(isolated, 'disabled-hooks')}`, '-c', 'core.fsmonitor=false', ...args],
          cwd,
          env: { ...env, ...extraEnv },
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
    try {
      if (realpathSync(await git(['rev-parse', '--show-toplevel'])) !== realpathSync(input.root))
        throw Error('Git repository root does not match this Play checkout.');
      await git(['check-ref-format', `refs/heads/${args.branch}`]);
      const urls = (await git(['remote', 'get-url', '--push', '--all', args.remote])).split('\n');
      if (urls.length !== 1 || urls[0] !== args.remoteUrl)
        throw Error(
          'The push destination changed or has multiple URLs. Inspect the remote and request approval again.',
        );
      if ((await git(['rev-parse', '--verify', `refs/heads/${args.branch}`])) !== args.commit)
        throw Error('The branch changed. Inspect its new commit and request approval again.');
      const objects = realpathSync(await git(['rev-parse', '--path-format=absolute', '--git-path', 'objects']));
      const shallow = await git(['rev-parse', '--path-format=absolute', '--git-path', 'shallow']);
      await git(
        ['init', '--bare', '--template=', `--object-format=${args.commit.length === 64 ? 'sha256' : 'sha1'}`, isolated],
        10_000,
        isolated,
      );
      if (existsSync(shallow)) copyFileSync(shallow, join(isolated, 'shallow'));
      const pushEnv = { GIT_DIR: isolated, GIT_OBJECT_DIRECTORY: objects, GIT_ALLOW_PROTOCOL: 'ssh:https' };
      if ((await git(['cat-file', '-t', args.commit], 10_000, isolated, pushEnv)) !== 'commit')
        throw Error('The approved branch must point directly to a commit.');
      input.write(`Pushing ${args.commit.slice(0, 12)} to ${args.remote}/${args.branch}…`);
      const output = await git(
        [
          'push',
          '--porcelain',
          '--no-force',
          '--no-follow-tags',
          '--no-mirror',
          '--recurse-submodules=no',
          '--',
          args.remoteUrl,
          `${args.commit}:refs/heads/${args.branch}`,
        ],
        60_000,
        isolated,
        pushEnv,
      );
      return stripTerminalControls(output);
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  };
  return {
    name: 'game_git_push',
    description:
      'Push a committed source-repository branch through the CLI host, using the creator’s host Git/SSH credentials even when the agent shell cannot use SSH. Only when the creator asked to push. Inspect git remote get-url --push --all REMOTE and git rev-parse refs/heads/BRANCH first; pass that exact SSH/HTTPS URL and full commit SHA. Include the remote, branch and commit in approval_summary. Requires approval in Play; ignores checkout Git configuration and disables hooks. Refuses changed branches/destinations, force pushes, deletions, multiple push URLs, local paths, custom transports and gamedevpl: platform delivery remotes. Does not commit files or publish on gamedev.pl.',
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
