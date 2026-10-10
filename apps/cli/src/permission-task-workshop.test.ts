import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAdapters } from './adapters.js';
import { AUTO_NEXT, AUTO_RESUME } from './agent-approval.js';
import { permissionMode, setPermissionMode } from './agent-permissions.js';
beforeEach(() => setPermissionMode('ask'));
import { runLocalBuild, type Workshop } from './workshop.js';

const roots: string[] = [];
afterEach(() => {
  setPermissionMode('ask');
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it.each([false, true])('keeps permission mode across validation repairs (resume=%s)', async (resume) => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-auto-repairs-'));
  roots.push(root);
  mkdirSync(join(root, 'games/test'), { recursive: true });
  const spec = loadAdapters().adapters.find((row) => row.name === 'claude')!;
  const pick = vi.fn(async () => 'Allow once').mockResolvedValueOnce(resume ? AUTO_RESUME : AUTO_NEXT);
  let calls = 0;
  const policies: unknown[] = [];
  const ws: Workshop = {
    root,
    slug: 'test',
    token: '',
    env: {},
    adapters: [spec],
    builder: 'self',
    abort: { current: null },
    pick,
    run: (_cmd, args) =>
      args[1] === 'check:static' && calls === (resume ? 2 : 1)
        ? { status: 1, stderr: 'bad metadata' }
        : { status: 0, stderr: '' },
    runAdapter: async (run) => {
      calls++;
      policies.push(run.permissions);
      if (calls === 1 || (!resume && calls === 2)) {
        if (resume) run.onEvent!({ type: 'session', sessionId: 'kept-conversation' });
        const decision = await run.onApproval!({
          id: 'call-' + calls,
          kind: 'command',
          detail: { tool_name: 'Bash', input: { command: 'npm test' } },
        });
        expect(decision).toBe(resume ? 'deny' : 'approve');
        if (resume) return { code: 1 };
      }
      writeFileSync(join(run.cwd, 'game.ts'), String(calls));
      return { code: 0 };
    },
  };
  expect(await runLocalBuild({ ws, spec, brief: 'Fix game', write: vi.fn() })).toBe(true);
  const auto = { approval: 'auto-approve', sandbox: 'workspace-write' };
  expect(policies).toEqual(resume ? [undefined, auto, auto] : [undefined, undefined]);
  expect(permissionMode()).toBe('auto');
  if (!resume) expect(pick.mock.calls[1][0]).not.toContain(AUTO_NEXT);
  const picks = pick.mock.calls.length;
  expect(await runLocalBuild({ ws, spec, brief: 'Next task', write: vi.fn() })).toBe(true);
  expect(policies.at(-1)).toEqual(auto);
  expect(pick.mock.calls).toHaveLength(picks);
});
