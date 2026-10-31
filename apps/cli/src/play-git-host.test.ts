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

function fixture(objectFormat: 'sha1' | 'sha256' = 'sha1') {
  const base = mkdtempSync(join(tmpdir(), 'play-host-push-'));
  roots.push(base);
  const root = join(base, 'checkout');
  const remote = join(base, 'remote.git');
  const remoteUrl = 'git@example.invalid:game.git';
  const env = { ...process.env };
  const ssh = join(base, 'ssh.cjs');
  writeFileSync(
    ssh,
    `const fs = require('node:fs');
if (process.env.PLAY_HOST_PUSH_MARKER) fs.writeFileSync(process.env.PLAY_HOST_PUSH_MARKER, process.env.SSH_AUTH_SOCK);
const child = require('node:child_process').spawnSync('git-receive-pack', [process.env.PLAY_HOST_PUSH_REMOTE], {stdio: 'inherit'});
process.exit(child.status ?? 1);
`,
  );
  env.PLAY_HOST_PUSH_REMOTE = remote;
  env.GIT_SSH_COMMAND = `"${process.execPath}" "${ssh}"`;
  env.GIT_SSH_VARIANT = 'ssh';
  mkdirSync(root);
  const git = (args: string[], cwd = root) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    if (result.status !== 0) throw Error(result.stderr);
    return result.stdout.trim();
  };
  git(['init', '--quiet', '--initial-branch=master', `--object-format=${objectFormat}`]);
  git(['init', '--quiet', '--bare', `--object-format=${objectFormat}`, remote]);
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
  git(['remote', 'add', 'origin', remoteUrl]);
  const controller = new AbortController();
  const writer = vi.fn(async <T>(run: () => Promise<T>) => run());
  const tool = playGitPushTool({ root, env, abort: () => controller.signal, write: vi.fn(), writer });
  const args = { remote: 'origin', remoteUrl, branch: 'master', commit: sha };
  return { base, root, remote, git, commit, sha, controller, writer, env, tool, args };
}

function attack(f: ReturnType<typeof fixture>) {
  const script = join(f.base, 'attack');
  const marker = join(f.base, 'outside-checkout');
  f.env.PLAY_HOST_PUSH_ATTACK = marker;
  f.env.PLAY_HOST_PUSH_SECRET = 'dummy-host-only-value';
  writeFileSync(script, '#!/bin/sh\nprintf %s "$PLAY_HOST_PUSH_SECRET" > "$PLAY_HOST_PUSH_ATTACK"\nexit 1\n', {
    mode: 0o755,
  });
  return { script, marker };
}

it.each(['default', 'configured', 'included'])(
  'disables %s checkout hooks while pushing the approved commit',
  async (kind) => {
    const f = fixture();
    const { script, marker } = attack(f);
    const hooks = join(f.root, kind === 'default' ? '.git/hooks' : 'agent-hooks');
    mkdirSync(hooks, { recursive: true });
    writeFileSync(join(hooks, 'pre-push'), readFileSync(script), { mode: 0o755 });
    if (kind === 'configured') f.git(['config', 'core.hooksPath', hooks]);
    if (kind === 'included') {
      const config = join(f.root, 'agent.config');
      f.git(['config', '--file', config, 'core.hooksPath', hooks]);
      f.git(['config', 'include.path', config]);
    }
    await f.tool.run(f.args);
    expect(existsSync(marker)).toBe(false);
    expect(f.git(['rev-parse', 'refs/heads/master'], f.remote)).toBe(f.sha);
  },
);

it.each(['core.sshCommand', 'remote.origin.receivepack', 'core.alternateRefsCommand'])(
  'ignores checkout %s and preserves the host SSH configuration',
  async (key) => {
    const f = fixture();
    const { script, marker } = attack(f);
    const hostConfig = join(f.base, 'host.config');
    f.git(['config', '--file', hostConfig, 'core.sshCommand', f.env.GIT_SSH_COMMAND!]);
    f.env.GIT_CONFIG_GLOBAL = hostConfig;
    delete f.env.GIT_SSH_COMMAND;
    f.git(['config', key, script]);
    await f.tool.run(f.args);
    expect(existsSync(marker)).toBe(false);
    expect(f.git(['rev-parse', 'refs/heads/master'], f.remote)).toBe(f.sha);
  },
);

it('does not reread checkout transport configuration after checking the approved destination', async () => {
  const f = fixture();
  const { script, marker } = attack(f);
  const tool = playGitPushTool({
    root: f.root,
    env: f.env,
    abort: () => f.controller.signal,
    write: () => {
      f.git(['config', 'remote.origin.receivepack', script]);
      f.git(['remote', 'set-url', 'origin', 'ext::anything']);
    },
  });
  await tool.run(f.args);
  expect(existsSync(marker)).toBe(false);
  expect(f.git(['rev-parse', 'refs/heads/master'], f.remote)).toBe(f.sha);
});

it('keeps host HTTPS credential helpers while excluding checkout credential helpers and includes', async () => {
  const f = fixture();
  const { script, marker } = attack(f);
  const hostConfig = join(f.base, 'host.config');
  const credentials = join(f.base, 'host-credentials');
  const helper = join(f.base, 'https.cjs');
  const bin = join(f.base, 'bin');
  mkdirSync(bin);
  writeFileSync(credentials, '#!/bin/sh\nprintf "username=fixture\\npassword=dummy\\n"\n', { mode: 0o755 });
  f.git(['config', '--file', hostConfig, 'credential.helper', `!"${credentials}"`]);
  const localConfig = join(f.root, 'agent.config');
  f.git(['config', '--file', localConfig, 'credential.helper', `!"${script}"`]);
  f.git(['config', 'include.path', localConfig]);
  f.env.GIT_CONFIG_GLOBAL = hostConfig;
  f.env.PLAY_HOST_PUSH_NODE = process.execPath;
  f.env.PLAY_HOST_PUSH_HTTPS = helper;
  f.env.GIT_EXEC_PATH = bin;
  writeFileSync(join(bin, 'git-remote-https'), '#!/bin/sh\nexec "$PLAY_HOST_PUSH_NODE" "$PLAY_HOST_PUSH_HTTPS"\n', {
    mode: 0o755,
  });
  writeFileSync(
    helper,
    `const { spawnSync } = require('node:child_process');
const result = spawnSync('git', ['credential', 'fill'], {input: 'protocol=https\\nhost=example.invalid\\n\\n', encoding: 'utf8'});
if (result.status !== 0 || !result.stdout.includes('password=dummy')) process.exit(1);
const rl = require('node:readline').createInterface({input: process.stdin});
rl.on('line', (line) => {
  if (line === 'capabilities') process.stdout.write('connect\\n\\n');
  else if (line === 'connect git-receive-pack') {
    rl.close();
    process.stdin.pause();
    process.stdout.write('\\n', () => {
      const child = spawnSync('git-receive-pack', [process.env.PLAY_HOST_PUSH_REMOTE], {stdio: 'inherit'});
      process.exit(child.status ?? 1);
    });
  }
});
`,
  );
  const remoteUrl = 'https://example.invalid/game.git';
  f.git(['remote', 'set-url', 'origin', remoteUrl]);
  await f.tool.run({ ...f.args, remoteUrl });
  expect(existsSync(marker)).toBe(false);
  expect(f.git(['rev-parse', 'refs/heads/master'], f.remote)).toBe(f.sha);
});

it.each(['sha1', 'sha256'] as const)('pushes from a linked %s worktree', async (objectFormat) => {
  const f = fixture(objectFormat);
  const root = join(f.base, 'linked');
  f.git(['worktree', 'add', '--quiet', '-b', 'play', root, f.sha]);
  const tool = playGitPushTool({ root, env: f.env, abort: () => f.controller.signal, write: () => {} });
  await tool.run({ ...f.args, branch: 'play' });
  expect(f.git(['rev-parse', 'refs/heads/play'], f.remote)).toBe(f.sha);
});

it('refuses missing promised objects without invoking checkout-controlled fetch commands', async () => {
  const f = fixture();
  const { script, marker } = attack(f);
  const missing = 'a'.repeat(40);
  f.git(['config', 'remote.origin.promisor', 'true']);
  f.git(['config', 'remote.origin.partialclonefilter', 'blob:none']);
  f.git(['config', 'core.sshCommand', script]);
  delete f.env.GIT_SSH_COMMAND;
  writeFileSync(join(f.root, '.git/refs/heads/master'), `${missing}\n`);
  await expect(f.tool.run({ ...f.args, commit: missing })).rejects.toThrow();
  expect(existsSync(marker)).toBe(false);
  expect(f.git(['for-each-ref'], f.remote)).toBe('');
});

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
  const marker = join(f.base, 'host-env');
  f.env.PLAY_HOST_PUSH_MARKER = marker;
  f.env.SSH_AUTH_SOCK = 'host-only-socket';
  await f.tool.run(f.args);
  expect(readFileSync(marker, 'utf8')).toBe('host-only-socket');
  expect(f.git(['rev-parse', 'refs/heads/master'], f.remote)).toBe(f.sha);
});

it('cancels a running SSH process and leaves the remote unchanged', async () => {
  const f = fixture();
  const script = join(f.base, 'waiting-ssh.cjs');
  const marker = join(f.base, 'ssh-started');
  writeFileSync(
    script,
    `require('node:fs').writeFileSync(process.env.PLAY_HOST_PUSH_MARKER, String(process.pid));
setInterval(() => {}, 1000);
`,
  );
  f.env.GIT_SSH_COMMAND = `${process.execPath} ${script}`;
  f.env.GIT_SSH_VARIANT = 'ssh';
  f.env.PLAY_HOST_PUSH_MARKER = marker;
  const pushing = f.tool.run(f.args);
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
    { ...f.args, remoteUrl: f.remote },
    { ...f.args, remoteUrl: `file://${f.remote}` },
    { ...f.args, remoteUrl: 'ext::sh -c touch-outside' },
    { ...f.args, remoteUrl: 'https::https://example.invalid/repo' },
    { ...f.args, remoteUrl: '-host:repo' },
    { ...f.args, remoteUrl: 'git@example.invalid:repo\u009b31m' },
  ])
    expect(() => f.tool.validate!(args)).toThrow();
  await expect(f.tool.run({ ...f.args, branch: 'master:other' })).rejects.toThrow();
  f.git(['remote', 'set-url', '--add', '--push', 'origin', f.args.remoteUrl]);
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
