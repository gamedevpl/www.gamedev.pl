import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupHistoryFixtures, sourceLines } from '../test/history-edit-fixture.js';
import { localChangesFixture } from '../test/local-changes-fixture.js';
import { loadAdapters } from './adapters.js';
import { readBase } from './checkout.js';
import { readLocalOperation } from './local-operation.js';
import { writeLocalJson, OPERATION_FILE } from './local-change-store.js';
import { handleReplLine } from './repl.js';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import type { Workshop } from './workshop.js';

afterEach(() => {
  cleanupHistoryFixtures();
  vi.restoreAllMocks();
});

function fixture(project = false) {
  const f = localChangesFixture(project, true);
  if (project) {
    writeFileSync(join(f.root, 'package.json'), JSON.stringify({ scripts: { setup: 'node setup.mjs' } }));
    mkdirSync(join(f.root, '.gamedev/local'), { recursive: true });
    writeFileSync(join(f.root, '.gamedev/local/.gamedev-slug'), 'probe');
  }
  f.draft();
  f.advance();
  const lines: string[] = [];
  const pick = vi.fn<Workshop['pick']>(async (choices) => choices[0]!);
  const checks: string[] = [];
  const ws: Workshop = {
    root: f.root,
    slug: 'probe',
    token: 'tok',
    builder: 'platform',
    env: { PATH: '/usr/bin', HOME: f.root },
    adapters: [loadAdapters().adapters.find((a) => a.name === 'codex')!],
    pick,
    abort: { current: null },
    telemetry: { record: vi.fn(), flush: async () => {} },
    run: (_cmd, args) => {
      checks.push(args[1]!);
      return { status: 0, stderr: '' };
    },
    runAdapter: vi.fn(async (task) => {
      f.draft(sourceLines(9, 8));
      report(task.prompt);
      return { code: 0 };
    }),
  };
  function report(
    prompt: string,
    resolutions = readLocalOperation(f.root)!
      .conflicts.filter((c) => !c.resolved)
      .map((c) => ({ path: c.paths[0]!, choice: 'edited' })),
  ) {
    const path = prompt.match(/Write a JSON report to this exact path: ([^\n]+)/)![1]!;
    writeFileSync(path, JSON.stringify({ resolutions }));
    return path;
  }
  const run = (line: string, api = f.api) =>
    handleReplLine({ line, api, token: 'tok', workshop: ws, pick, write: (s) => lines.push(s) });
  return { ...f, ws, pick, checks, lines, report, run };
}

describe.each([false, true])('local conflict delegation, source repository=%s', (project) => {
  it.each(['/pull', '/resolve', '/push', '/publish', '/verify'])(
    '%s offers an agent and resolves without a builder handoff or delivery',
    async (line) => {
      const f = fixture(project);
      if (line !== '/pull' && line !== '/publish') await expect(f.pull()).rejects.toThrow('Pull conflicts');
      await f.run(line);
      expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
      expect(f.pick).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringMatching(/local agent/)]),
        expect.any(String),
      );
      expect(readLocalOperation(f.root)).toBeNull();
      expect(readBase(f.root)?.version).toBe('v4');
      expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 8));
      expect(f.checks).toContain('typecheck');
      expect(f.checks).toContain('check:static');
      expect(f.calls.every((path) => path.includes('/versions'))).toBe(true);
      expect(readFileSync(join(f.root, '.git/HEAD'), 'utf8')).toBe('caller HEAD');
      expect(readFileSync(join(f.root, '.git/index'), 'utf8')).toBe('caller index');
      expect(f.ws.builder).toBe('platform');
      expect(f.ws.telemetry!.record).toHaveBeenCalledWith('delegate_offered', { adapter: 'codex' });
      expect(f.ws.telemetry!.record).toHaveBeenCalledWith('delegate_used', { adapter: 'codex' });
    },
  );
  it('runs explicit /delegate against a pending merge without requesting server ownership', async () => {
    const f = fixture(project);
    await expect(f.pull()).rejects.toThrow('Pull conflicts');
    await f.run('/delegate rozwiaz konflikty po gamedevpl pull');
    expect(f.pick).not.toHaveBeenCalled();
    expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
    expect(readLocalOperation(f.root)).toBeNull();
    expect(f.calls.some((path) => path.includes('/handoff'))).toBe(false);
  });
  it('lets the creator decline without changing the merge or starting an agent', async () => {
    const f = fixture(project);
    await expect(f.pull()).rejects.toThrow('Pull conflicts');
    const state = readLocalOperation(f.root);
    f.pick.mockResolvedValue('Keep resolving manually');
    await f.run('/resolve');
    expect(readLocalOperation(f.root)).toEqual(state);
    expect(f.ws.runAdapter).not.toHaveBeenCalled();
    expect(f.checks).toEqual([]);
  });
});

it.each(['/pull --json', '/resolve --json', '/push --json'])('does not offer delegation for %s', async (line) => {
  const f = fixture();
  await expect(f.pull()).rejects.toThrow('Pull conflicts');
  await f.run(line);
  expect(f.pick).not.toHaveBeenCalled();
  expect(f.ws.runAdapter).not.toHaveBeenCalled();
});

it('keeps manual recovery available when no local agent is installed', async () => {
  const f = fixture();
  f.ws.adapters = [];
  await f.run('/pull');
  expect(f.pick).not.toHaveBeenCalled();
  expect(f.lines.join('\n')).toContain('/agents');
  expect(readLocalOperation(f.root)?.phase).toBe('active');
});

it('requires an explicit complete report and does not guess missing resolutions', async () => {
  const f = fixture();
  await expect(f.pull()).rejects.toThrow('Pull conflicts');
  vi.mocked(f.ws.runAdapter!).mockImplementation(async (task) => {
    f.draft('hand merge\n');
    f.report(task.prompt, []);
    return { code: 0 };
  });
  await f.run('/delegate resolve conflicts');
  expect(f.lines.join('\n')).toContain('explicitly resolve every pending conflict');
  expect(readLocalOperation(f.root)?.conflicts[0]?.resolved).toBe(false);
  expect(readBase(f.root)?.version).toBe('v3');
  expect(f.checks).toEqual([]);
});

it('refuses remaining text markers even when the agent reports success', async () => {
  const f = fixture();
  await expect(f.pull()).rejects.toThrow('Pull conflicts');
  vi.mocked(f.ws.runAdapter!).mockImplementation(async (task) => {
    f.report(task.prompt);
    return { code: 0 };
  });
  await f.run('/delegate resolve conflicts');
  expect(f.lines.join('\n')).toContain('conflict markers');
  expect(readBase(f.root)?.version).toBe('v3');
  expect(f.checks).toEqual([]);
});

it('supports deliberate ours for an add-delete conflict without requiring artificial source changes', async () => {
  const f = fixture();
  f.draft(sourceLines(2, 3));
  f.trees.v4 = f.trees.v4!.filter((file) => file.path !== 'later.ts');
  f.versions[0]!.sourceFiles = f.trees.v4.map((file) => file.path);
  writeFileSync(join(f.game, 'later.ts'), 'keep local\n');
  vi.mocked(f.ws.runAdapter!).mockImplementation(async (task) => {
    f.report(task.prompt, [{ path: 'later.ts', choice: 'ours' }]);
    return { code: 0 };
  });
  await f.run('/pull');
  expect(readFileSync(join(f.game, 'later.ts'), 'utf8')).toBe('keep local\n');
  expect(readLocalOperation(f.root)).toBeNull();
});

it('keeps stopped edits and retries locally while the platform owns the round', async () => {
  const f = fixture();
  vi.mocked(f.ws.runAdapter!).mockImplementationOnce(async (task) => {
    f.draft('partial edit\n');
    f.report(task.prompt);
    f.ws.abort.current!.abort();
    return { code: 0 };
  });
  await f.run('/pull');
  expect(readLocalOperation(f.root)?.conflicts[0]?.resolved).toBe(false);
  expect(f.checks).toEqual([]);
  expect(f.ws.failedTask?.localOnly).toBe(true);
  await f.run('/retry');
  expect(readLocalOperation(f.root)).toBeNull();
  expect(f.ws.failedTask).toBeUndefined();
});

it('does not complete a merge if the platform moved during repair', async () => {
  const f = fixture();
  vi.mocked(f.ws.runAdapter!).mockImplementation(async (task) => {
    f.draft('hand merge\n');
    f.report(task.prompt);
    f.versions.unshift({ ...f.versions[0]!, version: 'v5' });
    return { code: 0 };
  });
  await f.run('/pull');
  expect(f.lines.join('\n')).toContain('platform moved');
  expect(readBase(f.root)?.version).toBe('v3');
  expect(readLocalOperation(f.root)).not.toBeNull();
});

it('keeps a failed verification local and retries even when all conflict paths are already marked resolved', async () => {
  const f = fixture();
  let red = true;
  f.ws.run = () => (red ? { status: 1, stderr: 'fix the merged game' } : { status: 0, stderr: '' });
  await f.run('/pull');
  expect(readLocalOperation(f.root)?.conflicts.every((c) => c.resolved)).toBe(true);
  expect(readBase(f.root)?.version).toBe('v3');
  red = false;
  await f.run('/retry');
  expect(readLocalOperation(f.root)).toBeNull();
  expect(readBase(f.root)?.version).toBe('v4');
});

it('rechecks the merge journal during automatic validation repairs', async () => {
  const f = fixture();
  f.ws.run = () => ({ status: 1, stderr: 'repair this' });
  let attempts = 0;
  vi.mocked(f.ws.runAdapter!).mockImplementation(async (task) => {
    f.draft('merged\n');
    f.report(task.prompt);
    if (++attempts === 2) {
      const state = readLocalOperation(f.root)!;
      state.version = 'v9';
      writeLocalJson(f.root, OPERATION_FILE, state);
    }
    return { code: 0 };
  });
  await f.run('/pull');
  expect(f.lines.join('\n')).toContain('Merge state changed');
  expect(readBase(f.root)?.version).toBe('v3');
  expect(readLocalOperation(f.root)).not.toBeNull();
});

it.each(['apply', 'pop'])('offers local resolution after stash %s conflicts', async (verb) => {
  const f = fixture();
  await f.stash(['push']);
  f.draft('conflicting work\n');
  await f.run('/stash ' + verb);
  expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
  expect(readLocalOperation(f.root)).toBeNull();
  expect(readBase(f.root)?.version).toBe('v3');
});

it('rejects a symlinked resolution report and preserves its target', async () => {
  const f = fixture();
  const target = join(f.root, 'private.json');
  writeFileSync(target, 'private');
  const { symlinkSync } = await import('node:fs');
  vi.mocked(f.ws.runAdapter!).mockImplementation(async (task) => {
    const path = f.report(task.prompt);
    rmSync(path);
    symlinkSync(target, path);
    return { code: 0 };
  });
  await f.run('/pull');
  expect(readFileSync(target, 'utf8')).toBe('private');
  expect(f.lines.join('\n')).toContain('Invalid agent merge report');
  expect(existsSync(join(f.root, '.gamedev/merge.json'))).toBe(true);
});

it('sends pending-merge context to chat and executes its local action without a build round', async () => {
  const f = fixture();
  await expect(f.pull()).rejects.toThrow('Pull conflicts');
  const posts: { path: string; body: unknown }[] = [];
  const api = createApi({
    origin: f.api.origin,
    store: memoryStore({ accessToken: 'fixture' }),
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === 'POST') posts.push({ path, body: JSON.parse(String(init.body)) });
      if (path === '/api/cli/chat')
        return Response.json({
          kind: 'action',
          conversationId: 'c',
          action: { name: 'local', request: 'Rozwiąż konflikty po pullu' },
        });
      return Response.json(await f.api.request('GET', path));
    },
  });
  await f.run('rozwiaz konflikty po pullu', api);
  expect(posts).toEqual([
    {
      path: '/api/cli/chat',
      body: expect.objectContaining({ session: expect.objectContaining({ localTasks: true, pendingMerge: 'pull' }) }),
    },
  ]);
  expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
  expect(readLocalOperation(f.root)).toBeNull();
});
