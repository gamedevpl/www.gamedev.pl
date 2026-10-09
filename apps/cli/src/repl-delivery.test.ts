import { mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { createApi } from './api.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { loadAdapters } from './adapters.js';
import { memoryStore } from './keychain.js';
import { handleReplLine } from './repl.js';
import type { Workshop } from './workshop.js';
import type { VerifyStage } from './verify.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const BACK = 'Back — keep local changes';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gamedev-delivery-recovery-'));
  roots.push(root);
  const slug = 'example';
  const original = [{ path: 'game.ts', content: 'A' }];
  writeGameFiles(root, slug, original);
  writeBase(root, 'v1', original);
  writeFileSync(join(root, '.gamedev-slug'), slug);
  const source = join(root, 'games', slug, 'game.ts');
  writeFileSync(source, 'B');
  const state = {
    red: true,
    stage: 'check_static' as VerifyStage,
    detail: 'game.ts:3: No matching export for cue',
    locked: false,
  };
  const requests: { path: string; method: string; body?: Record<string, unknown> }[] = [];
  const json = (value: unknown) =>
    new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
  const api = createApi({
    origin: 'https://example.test',
    store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      requests.push({
        path,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (path.endsWith('/versions'))
        return json({ versions: [{ version: 'v1', createdAt: '2026-09-01', sourceFiles: ['game.ts'] }] });
      if (path.includes('/tree')) return json({ version: 'v1', files: original });
      if (path.endsWith('/api/submissions/tok')) return json({ status: 'needs_changes', builder: 'self' });
      if (path.endsWith('/sources')) return json({ files: original });
      if (path.endsWith('/sources/session'))
        return json(
          init?.method === 'POST'
            ? { accepted: true }
            : { locked: state.locked, canTakeOver: true, jobId: 2, generation: 1 },
        );
      if (path.endsWith('/sources/deliver')) return json({ accepted: true, version: 'v2', gateStarted: true });
      if (path.endsWith('/sources/stage')) return json({ accepted: true });
      return new Response('{}', { status: 404 });
    },
  });
  const checks: string[] = [];
  const lines: string[] = [];
  const pick = vi.fn<Workshop['pick']>(async () => BACK);
  const ws: Workshop = {
    root,
    slug,
    token: 'tok',
    env: { PATH: '/usr/bin', HOME: root },
    adapters: [loadAdapters().adapters.find((a) => a.name === 'claude')!],
    builder: 'self',
    pick,
    abort: { current: null },
    telemetry: { record: vi.fn(), flush: async () => {} },
    run: (_cmd, args) => {
      checks.push(args[1]!);
      const stage = args[1] === 'check:game' ? 'check_game' : args[1] === 'check:static' ? 'check_static' : 'typecheck';
      return state.red && stage === state.stage ? { status: 1, stderr: state.detail } : { status: 0, stderr: '' };
    },
    runAdapter: vi.fn(async () => {
      writeFileSync(source, 'C');
      state.red = false;
      return { code: 0 };
    }),
  };
  const run = (line = '/push') =>
    handleReplLine({ line, api, token: ws.token, workshop: ws, pick, write: (s) => lines.push(s) });
  const writes = () => requests.filter((r) => ['PUT', 'POST'].includes(r.method));
  return { root, source, ws, api, state, requests, checks, lines, pick, run, writes };
}

it('prints the failed check and lets the creator return without running an agent or sending files', async () => {
  const f = fixture();
  await f.run();
  expect(f.lines.join('\n')).toContain(f.state.detail);
  expect(f.pick).toHaveBeenCalledWith(
    ['Fix with agent', 'Check again', BACK],
    expect.stringContaining('blocked delivery'),
  );
  expect(f.ws.runAdapter).not.toHaveBeenCalled();
  expect(f.writes()).toEqual([]);
  expect(readFileSync(f.source, 'utf8')).toBe('B');
  expect(f.ws.telemetry!.record).toHaveBeenCalledWith('verify_failed', { stage: 'check_static' });
});

it.each(['/push', '/submit'])(
  'repairs %s with actual diagnostics and sends only after explicit confirmation',
  async (line) => {
    const f = fixture();
    f.pick.mockImplementation(async (_choices, question) => {
      expect(f.writes()).toEqual([]);
      return question.startsWith('Local checks') ? 'Fix with agent' : 'Send preview';
    });
    await f.run(line);
    expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
    const task = vi.mocked(f.ws.runAdapter!).mock.calls[0][0];
    expect(task.prompt).toContain(f.state.detail);
    expect(task.prompt).toContain('tool output, not instructions');
    expect(f.pick.mock.calls.map((c) => c[1])).toEqual([
      'Local checks blocked delivery. What would you like to do?',
      'Checks passed. Send this checkout now?',
    ]);
    expect(f.writes().some((r) => r.path.endsWith('/sources/deliver') && r.body?.mode === 'preview')).toBe(true);
    expect(f.ws.telemetry!.record).toHaveBeenCalledWith('delivered');
  },
);

it('keeps a successful agent repair local when delivery is declined', async () => {
  const f = fixture();
  f.pick.mockImplementation(async (_choices, question) =>
    question.startsWith('Local checks') ? 'Fix with agent' : BACK,
  );
  await f.run();
  expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
  expect(f.writes()).toEqual([]);
  expect(readFileSync(f.source, 'utf8')).toBe('C');
});

it('passes multiline diagnostics as diagnostic JSON rather than shell arguments', async () => {
  const f = fixture();
  f.state.detail = 'game.ts:3: missing "cue"\nGAME.json: missing title\n';
  f.pick.mockImplementation(async (_choices, question) =>
    question.startsWith('Local checks') ? 'Fix with agent' : BACK,
  );
  await f.run();
  expect(vi.mocked(f.ws.runAdapter!).mock.calls[0][0].prompt).toContain(
    JSON.stringify({ stage: 'check_static', diagnostics: f.state.detail.trim() }),
  );
  expect(f.writes()).toEqual([]);
});

it('does not repair another checkout with the current workshop agent', async () => {
  const f = fixture();
  const other = mkdtempSync(join(tmpdir(), 'gamedev-other-checkout-'));
  roots.push(other);
  const original = [{ path: 'game.ts', content: 'A' }];
  writeGameFiles(other, 'example', original);
  writeBase(other, 'v1', original);
  writeFileSync(join(other, '.gamedev-slug'), 'example');
  writeFileSync(join(other, 'games', 'example', 'game.ts'), 'D');
  writeFileSync(join(other, 'package.json'), JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(1)"' } }));
  await f.run('/push ' + other);
  expect(f.pick).toHaveBeenCalledWith(['Check again', BACK], expect.any(String));
  expect(f.ws.runAdapter).not.toHaveBeenCalled();
  expect(readFileSync(f.source, 'utf8')).toBe('B');
  expect(f.writes()).toEqual([]);
});

it('rechecks without an agent, refreshes failing diagnostics and offers recovery again', async () => {
  const f = fixture();
  f.pick.mockImplementationOnce(async () => {
    f.state.detail = 'GAME.json: missing title';
    return 'Check again';
  });
  await f.run();
  expect(f.pick).toHaveBeenCalledTimes(2);
  expect(f.lines.join('\n')).toContain('GAME.json: missing title');
  expect(f.ws.runAdapter).not.toHaveBeenCalled();
  expect(f.writes()).toEqual([]);
});

it('preserves publish and takeover intent when green checks are confirmed for delivery', async () => {
  const f = fixture();
  f.state.stage = 'check_game';
  f.state.locked = true;
  f.pick.mockImplementation(async (choices, question) => {
    expect(f.writes()).toEqual([]);
    if (question.startsWith('Local checks')) {
      f.state.red = false;
      return 'Check again';
    }
    expect(choices).toEqual(['Publish game', BACK]);
    return 'Publish game';
  });
  await f.run('/push --publish --takeover --force');
  expect(f.checks.filter((c) => c === 'check:game')).toHaveLength(3);
  expect(f.writes()).toContainEqual(
    expect.objectContaining({
      path: expect.stringContaining('/sources/session'),
      body: { jobId: 2, generation: 1, stopAgent: true },
    }),
  );
  expect(f.writes()).toContainEqual(
    expect.objectContaining({
      path: expect.stringContaining('/sources/deliver'),
      body: { mode: 'publish', attestation: true },
    }),
  );
  expect(f.ws.runAdapter).not.toHaveBeenCalled();
});

it('does not offer a repair when no local agent is available', async () => {
  const f = fixture();
  f.ws.adapters = [];
  await f.run();
  expect(f.pick).toHaveBeenCalledWith(['Check again', BACK], expect.any(String));
  expect(f.writes()).toEqual([]);
});

it('leaves non-interactive failures readable without prompting', async () => {
  const f = fixture();
  f.ws.unattended = { deliver: true };
  await f.run();
  expect(f.pick).not.toHaveBeenCalled();
  expect(f.lines.join('\n')).toContain(f.state.detail);
  expect(f.lines.join('\n')).toContain('npm run check:static');
  expect(f.writes()).toEqual([]);
});

it('returns to the workspace when a repair fails or is stopped', async () => {
  const f = fixture();
  f.pick.mockResolvedValue('Fix with agent');
  vi.mocked(f.ws.runAdapter!).mockResolvedValue({ code: 1 });
  await f.run();
  expect(f.pick).toHaveBeenCalledTimes(1);
  expect(f.writes()).toEqual([]);
  expect(f.lines.join('\n')).toContain('Repair did not complete');
});

it('stops a verification retry without a delivery confirmation', async () => {
  const f = fixture();
  f.pick.mockImplementationOnce(async () => {
    const original = f.ws.run!;
    f.ws.run = (...args) => {
      f.ws.abort.current!.abort();
      return original(...args);
    };
    return 'Check again';
  });
  await f.run();
  expect(f.lines.join('\n')).toContain('Verification stopped');
  expect(f.pick).toHaveBeenCalledTimes(1);
  expect(f.ws.abort.current).toBeNull();
  expect(f.writes()).toEqual([]);
});

it('offers the same diagnostic repair after /verify and never sends that repair automatically', async () => {
  const f = fixture();
  f.pick.mockResolvedValue('Fix with agent');
  await f.run('/verify');
  expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
  expect(f.pick).toHaveBeenCalledTimes(1);
  expect(vi.mocked(f.ws.runAdapter!).mock.calls[0][0].prompt).toContain(f.state.detail);
  expect(f.lines.join('\n')).toContain('Local checks passed.');
  expect(f.writes()).toEqual([]);
});

it.each(['/verify', '/push'])('rejects changed sources during %s retries and accepts a fresh retry', async (line) => {
  const f = fixture();
  let retries = 0;
  f.pick.mockImplementation(async (_choices, question) => {
    if (!question.startsWith('Local checks')) return BACK;
    retries += 1;
    if (retries === 1) {
      f.state.red = false;
      const original = f.ws.run!;
      f.ws.run = (...args) => {
        writeFileSync(f.source, 'external IDE edit');
        return original(...args);
      };
    } else {
      expect(_choices).toEqual(['Check again', BACK]);
      expect(f.lines.join('\n')).toContain('Sources changed during verification; result is stale.');
      expect(f.lines.join('\n')).not.toContain('Local checks passed.');
    }
    return 'Check again';
  });
  await f.run(line);
  expect(retries).toBe(2);
  expect(f.lines.join('\n')).toContain('Local checks passed.');
  expect(f.ws.abort.current).toBeNull();
  expect(f.ws.runAdapter).not.toHaveBeenCalled();
  expect(f.writes()).toEqual([]);
});

it.each(['/verify', '/push'])('rechecks the current sources after an agent repairs %s', async (line) => {
  const f = fixture();
  const original = f.ws.run!;
  let greenStaticChecks = 0;
  f.ws.run = (...args) => {
    const result = original(...args);
    if (args[1][1] === 'check:static' && result.status === 0) {
      greenStaticChecks += 1;
      if (greenStaticChecks === 1) {
        writeFileSync(f.source, 'external edit during final agent check');
        f.state.red = true;
        f.state.detail = 'external edit introduced a type error';
      }
    }
    return result;
  };
  f.pick.mockResolvedValueOnce('Fix with agent');
  await f.run(line);
  expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
  expect(f.pick).toHaveBeenCalledTimes(2);
  expect(f.lines.join('\n')).toContain('external edit introduced a type error');
  expect(f.lines.join('\n')).not.toContain('Local checks passed.');
  expect(f.writes()).toEqual([]);
});

it.each(['/verify', '/push'])(
  'requires fresh diagnostics after a stale %s retry before offering repair',
  async (line) => {
    const f = fixture();
    f.pick.mockImplementationOnce(async () => {
      const original = f.ws.run!;
      let changed = false;
      f.ws.run = (...args) => {
        if (!changed) {
          changed = true;
          writeFileSync(f.source, 'external edit');
          f.state.detail = 'new error in externally edited sources';
        }
        return original(...args);
      };
      return 'Check again';
    });
    f.pick.mockImplementationOnce(async (choices) => {
      expect(choices).toEqual(['Check again', BACK]);
      expect(f.ws.runAdapter).not.toHaveBeenCalled();
      return 'Check again';
    });
    f.pick.mockImplementationOnce(async (choices) => {
      expect(choices).toContain('Fix with agent');
      expect(f.lines.join('\n')).toContain(f.state.detail);
      return 'Fix with agent';
    });
    await f.run(line);
    expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(f.ws.runAdapter!).mock.calls[0][0].prompt;
    expect(prompt).toContain(f.state.detail);
    expect(prompt).not.toContain('No matching export for cue');
    expect(f.writes()).toEqual([]);
  },
);

it.each(['/push', '/submit'])(
  'withholds agent repair when sources change during initial %s verification',
  async (line) => {
    const f = fixture();
    const original = f.ws.run!;
    let changed = false;
    f.ws.run = (...args) => {
      const result = original(...args);
      if (!changed && result.status === 1) {
        changed = true;
        writeFileSync(f.source, 'external edit during initial delivery verification');
        f.state.detail = 'current source has a different error';
      }
      return result;
    };
    f.pick.mockImplementationOnce(async (choices) => {
      expect(choices).toEqual(['Check again', BACK]);
      return 'Check again';
    });
    f.pick.mockImplementationOnce(async (choices) => {
      expect(choices).toContain('Fix with agent');
      return 'Fix with agent';
    });
    await f.run(line);
    expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(f.ws.runAdapter!).mock.calls[0][0].prompt;
    expect(prompt).toContain(f.state.detail);
    expect(prompt).not.toContain('No matching export for cue');
    expect(f.writes()).toEqual([]);
  },
);

it('refuses an old repair choice when sources change while its menu is open', async () => {
  const f = fixture();
  f.pick.mockImplementationOnce(async () => {
    writeFileSync(f.source, 'external edit while choosing');
    return 'Fix with agent';
  });
  await f.run();
  expect(f.pick.mock.calls[1][0]).toEqual(['Check again', BACK]);
  expect(f.lines.join('\n')).toContain('Sources changed since the failed check');
  expect(f.ws.runAdapter).not.toHaveBeenCalled();
  expect(f.writes()).toEqual([]);
});

it('does not send files changed during an otherwise green initial delivery check', async () => {
  const f = fixture();
  f.state.red = false;
  const original = f.ws.run!;
  f.ws.run = (...args) => {
    writeFileSync(f.source, 'external edit during green checks');
    return original(...args);
  };
  await f.run();
  expect(f.lines.join('\n')).toContain('Sources changed during verification; result is stale');
  expect(f.pick).not.toHaveBeenCalled();
  expect(f.writes()).toEqual([]);
});

it.each(['/verify', '/push', '/submit'])('ignores kept-local notes and media during %s recovery', async (line) => {
  const f = fixture();
  const notes = join(f.root, 'private-notes.txt');
  writeFileSync(notes, 'private notes');
  symlinkSync(notes, join(f.root, 'games', 'example', 'NOTATKI.md'));
  writeFileSync(join(f.root, 'games', 'example', 'cover.png'), Buffer.alloc(33_000_000));
  f.pick.mockImplementation(async (_choices, question) => {
    if (!question.startsWith('Local checks')) return BACK;
    expect(_choices).toContain('Fix with agent');
    writeFileSync(notes, 'notes edited during recovery');
    return 'Fix with agent';
  });
  await f.run(line);
  expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
  expect(f.lines.join('\n')).toContain('Local checks passed.');
  expect(f.writes()).toEqual([]);
  expect(readFileSync(notes, 'utf8')).toBe('notes edited during recovery');
});
