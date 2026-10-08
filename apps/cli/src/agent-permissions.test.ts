import { afterEach, expect, it, vi } from 'vitest';
import { loadAdapters } from './adapters.js';
import {
  applyPermissionMode,
  choosePermissionMode,
  PERMISSIONS_ENV,
  parsePermissionMode,
  permissionMode,
  permissionsCommand,
  setPermissionMode,
  taskPermissions,
} from './agent-permissions.js';
import { createEventRenderer } from './agent-render.js';
import { liveArgs } from './live-agent.js';

afterEach(() => setPermissionMode('ask'));

const spec = (name: string) =>
  loadAdapters({ HOME: '/tmp/does-not-exist-gamedev' }).adapters.find((row) => row.name === name)!;
const ws = { pick: async () => '', unattended: undefined };

it('defaults to Ask and keeps the adapter flags and the creator prompt', () => {
  expect(permissionMode()).toBe('ask');
  const claude = spec('claude');
  const task = taskPermissions({ spec: claude, mode: 'ask', ws, signal: new AbortController().signal, write: vi.fn() });
  expect(task.spec.headless).toEqual(claude.headless);
  expect(task.permissions).toBeUndefined();
  expect(task.onApproval).toBeDefined();
  const unattended = taskPermissions({
    spec: claude,
    mode: 'ask',
    ws: { ...ws, unattended: { deliver: false } },
    signal: new AbortController().signal,
    write: vi.fn(),
  });
  expect(unattended.onApproval).toBeUndefined();
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
