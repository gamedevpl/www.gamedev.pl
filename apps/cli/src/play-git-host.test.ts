import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAppAgent } from 'genaicode/app-agent';
import { decideApproval } from './play-brain.js';
import { playGitPushTool } from './play-git-host.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'play-host-push-'));
  roots.push(base);
  const root = join(base, 'checkout');
  const remote = join(base, 'remote.git');
  mkdirSync(root);
  const git = (args: string[], cwd = root) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) throw Error(result.stderr);
    return result.stdout.trim();
  };
  git(['init', '--quiet', '--initial-branch=master']);
  git(['init', '--quiet', '--bare', remote]);
  git(['config', 'user.name', 'fixture']);
  git(['config', 'user.email', 'fixture@example.invalid']);
  git(['config', 'commit.gpgsign', 'false']);
  const commit = (text: string) => {
    writeFileSync(join(root, 'game.ts'), text);
    git(['add', 'game.ts']);
    git(['commit', '--quiet', '-m', text]);
    return git(['rev-parse', 'HEAD']);
  };
  const sha = commit('first');
  git(['remote', 'add', 'origin', remote]);
  const controller = new AbortController();
  const writer = vi.fn(async <T>(run: () => Promise<T>) => run());
  const env = { ...process.env };
  const tool = playGitPushTool({ root, env, abort: () => controller.signal, write: vi.fn(), writer });
  const args = { remote: 'origin', remoteUrl: remote, branch: 'master', commit: sha };
  return { base, root, remote, git, commit, sha, controller, writer, env, tool, args };
}

it.each(['ask', 'auto', 'yolo'] as const)(
  'requires an action decision for host Git pushes even in %s mode',
  async (mode) => {
    const f = fixture();
    const agent = createAppAgent({
      name: 'Play push fixture',
      tools: [f.tool],
      agents: () => [
        {
          name: 'claude',
          command: process.execPath,
          capabilities: { mcp: true },
          run: () => {
            throw Error('No model run is needed to decide a host action.');
          },
        },
      ],
      dev: { cwd: f.root, commit: 'on-request', only: true },
      mcpUrl: 'http://127.0.0.1:1/mcp',
      autoApprove: (request) => decideApproval(mode, request),
    });
    try {
      const call = agent.mcpTools().find((tool) => tool.name === 'game_git_push')!;
      await call.call({ ...f.args, approval_summary: 'Push origin/master' });
      const rejected = agent.get().actions.at(-1)!;
      expect(rejected.status).toBe('pending');
      expect(f.git(['for-each-ref'], f.remote)).toBe('');
      agent.decide(rejected.id, 'reject');
      expect(agent.get().actions.at(-1)!.status).toBe('rejected');
      expect(f.git(['for-each-ref'], f.remote)).toBe('');
      await call.call({ ...f.args, approval_summary: 'Push origin/master' });
      expect(agent.get().actions.at(-1)!.status).toBe('pending');
      agent.decide(agent.get().actions.at(-1)!.id, 'approve');
      await vi.waitFor(() => expect(agent.get().actions.at(-1)!.status).toBe('done'));
      expect(f.git(['rev-parse', 'refs/heads/master'], f.remote)).toBe(f.sha);
    } finally {
      agent.close();
    }
  },
);

it('pushes the exact approved commit through host Git without tags, mirror mode or other branches', async () => {
  const f = fixture();
  f.git(['branch', 'unrelated']);
  f.git(['tag', '-a', '-m', 'do not push this tag', 'unrelated']);
  f.git(['config', 'push.followTags', 'true']);
  f.git(['config', 'remote.origin.mirror', 'true']);
  expect(f.tool.write).toBe(true);
  await f.tool.run(f.args);
  expect(f.git(['rev-parse', 'refs/heads/master'], f.remote)).toBe(f.sha);
  expect(f.git(['for-each-ref', '--format=%(refname)'], f.remote)).toBe('refs/heads/master');
  expect(f.writer).toHaveBeenCalledOnce();
});

it('uses the host SSH environment instead of the agent shell', async () => {
  const f = fixture();
  const script = join(f.base, 'ssh.cjs');
  const marker = join(f.base, 'host-env');
  writeFileSync(
    script,
    `const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(marker)}, process.env.SSH_AUTH_SOCK);
const child = require('node:child_process').spawnSync('git-receive-pack', [${JSON.stringify(f.remote)}], {stdio: 'inherit'});
process.exit(child.status ?? 1);
`,
  );
  f.env.SSH_AUTH_SOCK = 'host-only-socket';
  f.env.GIT_SSH_COMMAND = `${process.execPath} ${script}`;
  f.env.GIT_SSH_VARIANT = 'ssh';
  const remoteUrl = 'git@example.invalid:game.git';
  f.git(['remote', 'set-url', 'origin', remoteUrl]);
  await f.tool.run({ ...f.args, remoteUrl });
  expect(readFileSync(marker, 'utf8')).toBe('host-only-socket');
  expect(f.git(['rev-parse', 'refs/heads/master'], f.remote)).toBe(f.sha);
});

it('cancels a running SSH process and leaves the remote unchanged', async () => {
  const f = fixture();
  const script = join(f.base, 'waiting-ssh.cjs');
  const marker = join(f.base, 'ssh-started');
  writeFileSync(
    script,
    `require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid));
setInterval(() => {}, 1000);
`,
  );
  f.env.GIT_SSH_COMMAND = `${process.execPath} ${script}`;
  f.env.GIT_SSH_VARIANT = 'ssh';
  const remoteUrl = 'git@example.invalid:game.git';
  f.git(['remote', 'set-url', 'origin', remoteUrl]);
  const pushing = f.tool.run({ ...f.args, remoteUrl });
  const rejected = expect(pushing).rejects.toThrow('cancelled; check the remote');
  try {
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true));
  } finally {
    f.controller.abort();
  }
  await rejected;
  expect(f.git(['for-each-ref'], f.remote)).toBe('');
});

it('refuses a branch or destination changed since the action was proposed', async () => {
  const f = fixture();
  const newer = f.commit('second');
  await expect(f.tool.run(f.args)).rejects.toThrow('branch changed');
  f.git(['remote', 'set-url', 'origin', join(f.base, 'other.git')]);
  await expect(f.tool.run({ ...f.args, commit: newer })).rejects.toThrow('push destination changed');
  expect(f.git(['for-each-ref'], f.remote)).toBe('');
});

it('refuses multiple push URLs and malformed or option-like arguments', async () => {
  const f = fixture();
  for (const args of [
    { ...f.args, remote: '--receive-pack=sh' },
    { ...f.args, commit: 'HEAD' },
    { ...f.args, force: true },
    { ...f.args, command: 'touch outside' },
    { ...f.args, remoteUrl: 'gamedevpl://gamedev.pl/snake' },
  ])
    expect(() => f.tool.validate!(args)).toThrow();
  await expect(f.tool.run({ ...f.args, branch: 'master:other' })).rejects.toThrow();
  f.git(['remote', 'set-url', '--add', '--push', 'origin', f.remote]);
  f.git(['remote', 'set-url', '--add', '--push', 'origin', join(f.base, 'other.git')]);
  await expect(f.tool.run(f.args)).rejects.toThrow('multiple URLs');
  expect(f.git(['for-each-ref'], f.remote)).toBe('');
});

it('preserves non-fast-forward protection and reports the Git error', async () => {
  const f = fixture();
  const newer = f.commit('second');
  f.git(['push', '--quiet', 'origin', 'master']);
  f.git(['reset', '--hard', f.sha]);
  await expect(f.tool.run(f.args)).rejects.toThrow(/failed to push|rejected/i);
  expect(f.git(['rev-parse', 'refs/heads/master'], f.remote)).toBe(newer);
});

it('refuses nested working directories and cancellation before any push', async () => {
  const f = fixture();
  const nested = join(f.root, 'nested');
  mkdirSync(nested);
  const tool = playGitPushTool({ root: nested, abort: () => f.controller.signal, write: () => {} });
  await expect(tool.run(f.args)).rejects.toThrow('repository root');
  f.controller.abort();
  await expect(f.tool.run(f.args)).rejects.toThrow();
  expect(f.git(['for-each-ref'], f.remote)).toBe('');
});
