import { afterEach, expect, it, vi } from 'vitest';
import { loadAdapters } from './adapters.js';
import {
  applyPermissionMode,
  choosePermissionMode,
  PERMISSIONS_ENV,
  parsePermissionMode,
  permissionMode,
  permissionEnvironment,
  taskPermissionMode,
  permissionsCommand,
  setPermissionMode,
  taskPermissions,
} from './agent-permissions.js';
import { createEventRenderer } from './agent-render.js';
import { liveArgs } from './live-agent.js';
import { AUTO_NEXT } from './agent-approval.js';
import type { PermissionMode } from './agent-permissions.js';

afterEach(() => setPermissionMode());

const spec = (name: string) =>
  loadAdapters({ HOME: '/tmp/does-not-exist-gamedev' }).adapters.find((row) => row.name === name)!;
const ws = { pick: async () => '', unattended: undefined };

it('keeps explicit Ask adapter flags and the creator prompt', () => {
  const claude = spec('claude');
  const task = taskPermissions({
    spec: claude,
    mode: 'ask',
    cwd: '/game',
    ws,
    signal: new AbortController().signal,
    write: vi.fn(),
  });
  expect(task.spec.headless).toEqual(claude.headless);
  expect(task.permissions).toBeUndefined();
  expect(task.onApproval).toBeDefined();
  const unattended = taskPermissions({
    spec: claude,
    mode: 'ask',
    cwd: '/game',
    ws: { ...ws, unattended: { deliver: false } },
    signal: new AbortController().signal,
    write: vi.fn(),
  });
  expect(unattended.onApproval).toBeUndefined();
});

it('defaults to sandboxed Auto and uses Ask for unsupported agents', () => {
  expect(permissionMode()).toBe('auto');
  for (const name of ['claude', 'codex', 'gemini']) expect(taskPermissionMode(spec(name))).toBe('auto');
  for (const name of ['cursor', 'agy', 'muse']) expect(taskPermissionMode(spec(name))).toBe('ask');
  expect(taskPermissionMode({ ...spec('claude'), name: 'custom' })).toBe('ask');
  expect(permissionEnvironment()[PERMISSIONS_ENV]).toBe('');
  choosePermissionMode(undefined, permissionEnvironment());
  expect(taskPermissionMode(spec('cursor'))).toBe('ask');
  setPermissionMode('auto');
  expect(() => applyPermissionMode(spec('cursor'), taskPermissionMode(spec('cursor')))).toThrow();
  expect(permissionEnvironment()[PERMISSIONS_ENV]).toBe('auto');
  setPermissionMode('ask');
  expect(taskPermissionMode(spec('claude'))).toBe('ask');
  setPermissionMode();
  expect(taskPermissionMode(spec('claude'), 'ask')).toBe('ask');
});

it('translates Auto-approve and YOLO into each adapter’s flags', () => {
  const claude = applyPermissionMode(spec('claude'), 'auto').spec.headless;
  expect(claude).toContain('--settings');
  expect(claude.filter((arg) => arg === '--permission-mode')).toHaveLength(1);
  expect(applyPermissionMode(spec('codex'), 'yolo').spec.headless).toEqual(
    expect.arrayContaining(['--sandbox', 'danger-full-access', 'approval_policy="never"']),
  );
  expect(applyPermissionMode(spec('gemini'), 'auto')).toMatchObject({
    spec: { headless: expect.arrayContaining(['yolo', '--sandbox']) },
    env: { GEMINI_SANDBOX: 'true' },
  });
  // The yolo flags keep the adapter on its live session.
  expect(liveArgs(applyPermissionMode(spec('codex'), 'yolo').spec)).toContain('app-server');
});

it('refuses a mode the agent cannot honor instead of running another one', () => {
  expect(() => applyPermissionMode(spec('cursor'), 'auto')).toThrow(/cursor cannot run in Auto-approve/);
  expect(() => applyPermissionMode(spec('agy'), 'yolo')).toThrow(/agy cannot run in YOLO/);
  expect(() => applyPermissionMode(spec('muse'), 'auto')).toThrow(/Muse has no sandbox/);
  expect(applyPermissionMode(spec('muse'), 'yolo').spec).toEqual(spec('muse'));
});

it('approves unattended without asking and says so', async () => {
  const write = vi.fn();
  const pick = vi.fn();
  const task = taskPermissions({
    spec: spec('claude'),
    mode: 'yolo',
    cwd: '/game',
    ws: { pick, unattended: { deliver: false } },
    signal: new AbortController().signal,
    write,
  });
  expect(task.permissions).toBe('yolo');
  expect(await task.onApproval!({ id: 'a', kind: 'command', summary: 'npm test' })).toBe('approve');
  expect(pick).not.toHaveBeenCalled();
  expect(write).toHaveBeenCalledWith('claude: auto-approved command: npm test');
});

it('switches the mode with /permissions and shows it', async () => {
  const lines: string[] = [];
  await permissionsCommand({ args: ['yolo'], write: (line) => lines.push(line) });
  expect(permissionMode()).toBe('yolo');
  expect(lines[0]).toBe('Permissions: YOLO (full access, no questions)');
  await permissionsCommand({
    args: [],
    pick: async (choices) => choices[1]!,
    write: (line) => lines.push(line),
  });
  expect(permissionMode()).toBe('auto');
  expect(parsePermissionMode('auto-approve')).toBe('auto');
  expect(() => parsePermissionMode('all')).toThrow('unknown permission mode all');
});

it('shows automatic decisions in the transcript', () => {
  const render = createEventRenderer('codex');
  expect(render.event({ type: 'approval-request', request: { id: 'p1', kind: 'command', summary: 'ls' } })).toEqual([]);
  expect(render.event({ type: 'approval-resolved', id: 'p1', decision: 'approve', automatic: true }).join()).toContain(
    'Permission auto-approved: ls',
  );
  expect(render.event({ type: 'approval-resolved', id: 'p2', decision: 'deny' })).toEqual([]);
});

it('takes the flag, or the mode a Play worker was started with', () => {
  choosePermissionMode(undefined, { [PERMISSIONS_ENV]: 'yolo' });
  expect(permissionMode()).toBe('yolo');
  choosePermissionMode('auto', { [PERMISSIONS_ENV]: 'yolo' });
  expect(permissionMode()).toBe('auto');
  expect(() => choosePermissionMode(true, {})).toThrow('--permissions needs a mode');
});

it('remembers across interactive tasks in one checkout and clears with /permissions ask', async () => {
  const pick = vi.fn(async () => 'Always allow this exact command (this session)');
  const ws = { pick };
  const task = (owner = ws, cwd = '/game') =>
    taskPermissions({
      spec: spec('claude'),
      mode: 'ask',
      cwd,
      ws: owner,
      signal: new AbortController().signal,
      write: vi.fn(),
    });
  const request = { id: 'a', kind: 'command' as const, detail: { tool_name: 'Bash', input: { command: 'npm test' } } };
  const first = task();
  expect(await first.onApproval!(request)).toBe('approve');
  expect(await task().onApproval!({ ...request, id: 'b' })).toBe('approve');
  expect(pick).toHaveBeenCalledOnce();
  expect(await task(ws, '/other-game').onApproval!(request)).toBe('approve');
  expect(await task({ pick }).onApproval!(request)).toBe('approve');
  expect(pick).toHaveBeenCalledTimes(3);
  const unattended = taskPermissions({
    spec: spec('claude'),
    mode: 'ask',
    cwd: '/game',
    ws: { ...ws, unattended: { deliver: false } },
    signal: new AbortController().signal,
    write: vi.fn(),
  });
  expect(unattended.onApproval).toBeUndefined();
  await permissionsCommand({ args: ['ask'], write: vi.fn() });
  expect(await first.onApproval!(request)).toBe('approve');
  expect(pick).toHaveBeenCalledTimes(4);
});

it.each(['Allow once', 'Deny'])('does not remember an ordinary decision: %s', async (choice) => {
  const pick = vi.fn(async () => choice);
  const task = taskPermissions({
    spec: spec('claude'),
    mode: 'ask',
    cwd: '/game',
    ws: { pick },
    signal: new AbortController().signal,
    write: vi.fn(),
  });
  const request = { id: 'a', kind: 'command' as const, detail: { tool_name: 'Bash', input: { command: 'npm test' } } };
  expect(await task.onApproval!(request)).toBe(choice === 'Deny' ? 'deny' : 'approve');
  await task.onApproval!({ ...request, id: 'b' });
  expect(pick).toHaveBeenCalledTimes(2);
});

it('offers Auto fourth, allowing once while sandboxing only future Claude tasks', async () => {
  const pick = vi.fn(async () => AUTO_NEXT);
  const owner = { pick, permissionMode: 'ask' as PermissionMode | undefined };
  const options = {
    spec: spec('claude'),
    cwd: '/game',
    ws: owner,
    signal: new AbortController().signal,
    write: vi.fn(),
  };
  const active = taskPermissions({ ...options, mode: 'ask' });
  const request = { id: 'a', kind: 'command' as const, detail: { tool_name: 'Bash', input: { command: 'npm test' } } };
  expect(await active.onApproval!(request)).toBe('approve');
  expect(pick.mock.calls[0]?.[0]).toEqual([
    'Allow once',
    'Deny',
    'Always allow this exact command (this session)',
    AUTO_NEXT,
  ]);
  expect(permissionMode()).toBe('auto');
  expect(owner.permissionMode).toBeUndefined();
  expect(active.permissions).toBeUndefined();
  expect(active.spec.headless).toEqual(spec('claude').headless);
  pick.mockResolvedValue('Deny');
  expect(await active.onApproval!({ ...request, id: 'b' })).toBe('deny');
  expect(pick).toHaveBeenCalledTimes(2);
  expect(pick.mock.calls[1]?.[0]).not.toContain(AUTO_NEXT);
  const next = taskPermissions({ ...options, mode: permissionMode() });
  expect(next.permissions).toEqual({ approval: 'auto-approve', sandbox: 'workspace-write' });
  const settings = JSON.parse(next.spec.headless[next.spec.headless.indexOf('--settings') + 1]!);
  expect(settings.sandbox).toMatchObject({ enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false });
  expect(options.write).toHaveBeenCalledWith(expect.stringContaining('This task stays in Ask.'));
});

it('does not switch permissions when Auto is cancelled', async () => {
  setPermissionMode('ask');
  const abort = new AbortController();
  const pick = vi.fn(async () => {
    abort.abort();
    return AUTO_NEXT;
  });
  const task = taskPermissions({
    spec: spec('claude'),
    mode: 'ask',
    cwd: '/game',
    ws: { pick },
    signal: abort.signal,
    write: vi.fn(),
  });
  expect(
    await task.onApproval!({ id: 'a', kind: 'command', detail: { tool_name: 'Bash', input: { command: 'ls' } } }),
  ).toBe('deny');
  expect(permissionMode()).toBe('ask');
});

it('does not offer Claude’s Auto shortcut for another agent or turn-scoped permissions', async () => {
  for (const [agent, scope] of [
    ['codex', undefined],
    ['claude', 'turn'],
  ] as const) {
    const pick = vi.fn(async (_choices: string[]) => 'Deny');
    const task = taskPermissions({
      spec: spec(agent),
      mode: 'ask',
      cwd: '/game',
      ws: { pick },
      signal: new AbortController().signal,
      write: vi.fn(),
    });
    await task.onApproval!({ id: 'a', kind: 'other', scope });
    expect(pick.mock.calls[0]?.[0]).not.toContain(AUTO_NEXT);
  }
});
