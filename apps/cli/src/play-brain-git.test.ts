import { spawn, spawnSync } from 'node:child_process';
import { AsyncResource } from 'node:async_hooks';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { expect, it, vi } from 'vitest';
import type { AgentResult, AgentTask, CodingAgent } from 'genaicode/agents';
import { startPlayBrain, type PlayBrain } from './play-brain.js';
import type { Workshop } from './workshop.js';
import type { ApiClient } from './api.js';
import { readBase, writeBase, writeGameFiles } from './checkout.js';
import { submitGame } from './submit.js';
import { withCheckoutWriter } from './workbench-lock.js';

vi.mock('./submit.js', () => ({ submitGame: vi.fn() }));

it('pushes through the real Git helper during a Play turn and keeps unrelated writers excluded', async () => {
  const root = mkdtempSync(join(tmpdir(), 'play-git-helper-'));
  let brain: PlayBrain | undefined;
  const outside = new AsyncResource('unrelated-writer');
  const history = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ versions: [], hasMore: false }));
  });
  await new Promise<void>((resolve) => history.listen(0, '127.0.0.1', resolve));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'package.json'), '{"type":"module"}');
    symlinkSync(fileURLToPath(new URL('../../../node_modules', import.meta.url)), join(bin, 'node_modules'), 'dir');
    const helper = join(bin, 'git-remote-gamedevpl');
    buildSync({
      stdin: {
        contents: `import { runGitRemoteHelper } from ${JSON.stringify(fileURLToPath(new URL('./git-remote-main.ts', import.meta.url)))}; runGitRemoteHelper(process.argv).then(code => process.exit(code));`,
        resolveDir: root,
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      outfile: helper,
      banner: { js: '#!/usr/bin/env node' },
    });
    chmodSync(helper, 0o755);
    const git = (args: string[]) => {
      const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    git(['init', '-b', 'main']);
    git(['config', 'user.name', 'test creator']);
    git(['config', 'user.email', 'test@example.invalid']);
    git(['config', 'commit.gpgsign', 'false']);
    git(['remote', 'add', 'origin', 'gamedevpl://snake']);
    writeGameFiles(root, 'snake', [{ path: 'game.ts', content: 'committed game' }]);
    writeBase(root, 'v1', [{ path: 'game.ts', content: 'old game' }]);
    writeFileSync(join(root, '.gamedev-slug'), 'snake');
    git(['add', 'games', '.gamedev-slug']);
    git(['commit', '-m', 'game update']);
    writeGameFiles(root, 'snake', [{ path: 'game.ts', content: 'uncommitted game' }]);
    const originalHead = git(['rev-parse', 'HEAD']);
    vi.mocked(submitGame).mockImplementation(async ({ dest }) => {
      expect(readFileSync(join(dest, 'games/snake/game.ts'), 'utf8')).toBe('committed game');
      await expect(outside.runInAsyncScope(() => withCheckoutWriter(root, async () => {}))).rejects.toThrow(
        'owns this checkout',
      );
      return {
        kind: 'delivered',
        version: 'v2',
        mode: 'preview',
        gateStarted: true,
        staged: ['game.ts'],
        files: [{ path: 'game.ts', content: 'committed game' }],
        ignored: [],
        sync: { kind: 'local_only', version: 'v1', local: ['game.ts'], platform: [], conflict: [] },
      };
    });
    const runPush = (task: AgentTask) =>
      new Promise<string>((resolve, reject) => {
        const child = spawn('git', ['push', 'origin', 'HEAD:refs/heads/main'], {
          cwd: task.cwd,
          env: {
            ...process.env,
            ...task.env,
            PATH: `${bin}${delimiter}${process.env.PATH}`,
            GAMEDEV_TOKEN: 'fixture',
            GAMEDEV_ORIGIN: `http://127.0.0.1:${(history.address() as AddressInfo).port}`,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout.on('data', (chunk) => {
          output += String(chunk);
        });
        child.stderr.on('data', (chunk) => {
          output += String(chunk);
        });
        child.once('error', reject);
        child.once('close', (code) => (code === 0 ? resolve(output) : reject(Error(output))));
      });
    const agent: CodingAgent = {
      name: 'claude',
      command: process.execPath,
      capabilities: { resume: false, mcp: true },
      run(task) {
        const result: AgentResult = { status: 'completed', ok: true, exitCode: 0, signal: null };
        const done = runPush(task).then(
          () => result,
          (error: Error) => ({ ...result, ok: false, error: error.message }),
        );
        return {
          result: done,
          abort() {},
          async *[Symbol.asyncIterator]() {
            yield { type: 'done' as const, result: await done };
          },
        };
      },
    };
    const api: ApiClient = {
      origin: `http://127.0.0.1:${(history.address() as AddressInfo).port}`,
      request: async () => {
        throw Error('unexpected API call');
      },
      requestBytes: async () => Buffer.alloc(0),
    };
    const ws: Workshop = {
      root,
      slug: 'snake',
      token: 'fixture',
      env: {},
      adapters: [{ name: 'claude', command: 'claude' }],
      builder: 'self',
      abort: { current: null },
      runAdapter: async () => ({ code: 0 }),
      run: () => ({ status: 0, stderr: '' }),
      pick: async (choices) => choices.at(-1)!,
    };
    brain = await startPlayBrain({
      api,
      ws,
      agents: () => [agent],
      ready: async () => true,
      write: () => {},
      activity: () => {},
      prompt: async () => 'Deny',
    });
    await brain!.turn('push the committed changes');
    expect(submitGame).toHaveBeenCalledTimes(1);
    expect(readBase(root)?.version).toBe('v2');
    expect(readFileSync(join(root, 'games/snake/game.ts'), 'utf8')).toBe('uncommitted game');
    expect(git(['rev-parse', 'HEAD'])).toBe(originalHead);
    await expect(withCheckoutWriter(root, async () => 42)).resolves.toBe(42);
  } finally {
    await brain?.close();
    await new Promise<void>((resolve) => history.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
