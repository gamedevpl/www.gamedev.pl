import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeApprovalTool } from 'genaicode/agents';
import { runPermissionTask } from './permission-task.js';
import { loadAdapters } from './adapters.js';
import { AUTO_RESUME } from './agent-approval.js';
import { permissionMode, setPermissionMode, type PermissionMode } from './agent-permissions.js';
import { taskOutput } from './task-output.js';
import type { Workshop } from './workshop.js';
import type { AdapterRunInput } from './headless-agent.js';
import { localPreviewTools } from './local-preview-tools.js';

vi.mock('./local-preview-tools.js', () => ({
  LOCAL_PREVIEW_INSTRUCTIONS: 'Use preview tools.',
  localPreviewTools: vi.fn(async (input) => ({ spec: input.spec, approvals: true, close: vi.fn() })),
}));

const roots: string[] = [];
afterEach(() => {
  setPermissionMode('ask');
  vi.mocked(localPreviewTools).mockClear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-auto-resume-'));
  roots.push(root);
  const spec = loadAdapters().adapters.find((row) => row.name === 'claude')!;
  const pick = vi.fn(async () => AUTO_RESUME);
  const abort = new AbortController();
  const write = vi.fn();
  const ws: Workshop = {
    root,
    slug: 'test',
    token: 'tok',
    env: {},
    adapters: [spec],
    builder: 'self',
    pick,
    abort: { current: abort },
    permissionMode: 'ask',
  };
  const input = {
    ws,
    permissionState: { mode: 'ask' as PermissionMode },
    spec,
    cwd: root,
    prompt: 'Fix the game',
    abort: abort.signal,
    write,
    output: taskOutput(write),
    onRestart: vi.fn(),
  };
  return { input, pick, abort, ws, write };
}

const request = {
  id: 'tool-1',
  kind: 'command' as const,
  scope: 'once' as const,
  detail: { tool_name: 'Bash', input: { command: 'npm test' } },
};

it('resumes the same conversation only after stopping Ask and closing its endpoint', async () => {
  const { input, pick, ws } = setup();
  const runs: AdapterRunInput[] = [];
  ws.runAdapter = async (run) => {
    runs.push(run);
    if (runs.length === 1) {
      run.onEvent!({ type: 'session', sessionId: 'claude-conversation' });
      expect(await run.onApproval!(request)).toBe('deny');
      expect(run.abort!.aborted).toBe(true);
      expect(input.abort.aborted).toBe(false);
      expect(pick.mock.calls[0][0]).toEqual([
        'Allow once',
        'Deny',
        'Always allow this exact command (this session)',
        AUTO_RESUME,
      ]);
      return { code: 1 };
    }
    expect(vi.mocked(localPreviewTools).mock.results[0].value).toBeDefined();
    const previous = await vi.mocked(localPreviewTools).mock.results[0].value;
    expect(previous!.close).toHaveBeenCalledOnce();
    expect(run.spec.headless.slice(-2)).toEqual(['--resume', 'claude-conversation']);
    expect(run.permissions).toEqual({ approval: 'auto-approve', sandbox: 'workspace-write' });
    const settings = run.spec.headless.filter((value, index, args) => args[index - 1] === '--settings').map(JSON.parse);
    expect(settings).toContainEqual({
      sandbox: {
        enabled: true,
        failIfUnavailable: true,
        autoAllowBashIfSandboxed: true,
        allowUnsandboxedCommands: false,
      },
    });
    expect(run.prompt).toContain('Keep existing edits and completed work');
    const tool = claudeApprovalTool(run.onApproval!, { sandbox: 'workspace-write', cwd: input.cwd });
    const escaped = await tool.call({
      tool_name: 'Bash',
      input: { command: 'npm test', dangerouslyDisableSandbox: true },
    });
    expect(JSON.parse(escaped.content[0].text).behavior).toBe('deny');
    expect(
      await run.onApproval!({
        id: 'read',
        kind: 'other',
        detail: { tool_name: 'Read', input: { file_path: join(input.cwd, 'game.ts') } },
      }),
    ).toBe('approve');
    return { code: 0 };
  };
  expect(await runPermissionTask(input)).toEqual({ code: 0 });
  expect(runs).toHaveLength(2);
  expect(pick).toHaveBeenCalledOnce();
  expect(input.onRestart).toHaveBeenCalledOnce();
  expect(permissionMode()).toBe('auto');
  expect(ws.permissionMode).toBeUndefined();
  expect((await vi.mocked(localPreviewTools).mock.results[1].value)!.close).toHaveBeenCalledOnce();
});

it('does not restart when the creator cancels during process shutdown', async () => {
  const { input, ws, abort } = setup();
  ws.runAdapter = vi.fn(async (run) => {
    run.onEvent!({ type: 'session', sessionId: 'session-1' });
    await run.onApproval!(request);
    abort.abort();
    return { code: 1 };
  });
  expect(await runPermissionTask(input)).toEqual({ code: 1 });
  expect(ws.runAdapter).toHaveBeenCalledOnce();
  expect(input.onRestart).not.toHaveBeenCalled();
});

it('keeps Ask when the Auto choice is withdrawn', async () => {
  const { input, ws, pick, abort } = setup();
  pick.mockImplementation(async () => {
    abort.abort();
    return AUTO_RESUME;
  });
  ws.runAdapter = vi.fn(async (run) => {
    run.onEvent!({ type: 'session', sessionId: 'session-1' });
    expect(await run.onApproval!(request)).toBe('deny');
    return { code: 1 };
  });
  await runPermissionTask(input);
  expect(permissionMode()).toBe('ask');
  expect(ws.runAdapter).toHaveBeenCalledOnce();
});
