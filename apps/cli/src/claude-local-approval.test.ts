import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { claudeLocalApproval } from './claude-local-approval.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(sandbox: 'workspace-write' | 'read-only' | 'unrestricted' = 'workspace-write') {
  const cwd = mkdtempSync(join(tmpdir(), 'gdpl-claude-policy-'));
  roots.push(cwd);
  const approve = vi.fn(async () => 'approve' as const);
  const write = vi.fn();
  const tool = claudeLocalApproval(approve, { sandbox, cwd }, write);
  const call = async (input: unknown, tool_name = 'Bash', signal?: AbortSignal) => {
    const reply = await tool.call({ tool_name, input, tool_use_id: 'same-call' }, signal);
    return JSON.parse(reply.content[0]!.text);
  };
  return { cwd, approve, write, call, tool };
}

it.each([
  { command: 'MODE=fixture node -e "console.log(process.env.MODE)"', timeout: 240000 },
  { command: "node <<'JS'\nconsole.log('measure the train curve');\nJS", description: 'Run a local harness' },
  { command: 'make CC=clang', dangerouslyDisableSandbox: false, run_in_background: true },
])('allows a sandboxed Bash prompt without changing its input: %j', async (input) => {
  const f = fixture();
  expect(await f.call(input)).toEqual({ behavior: 'allow', updatedInput: input });
  expect(f.approve).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'same-call',
      kind: 'command',
      detail: { tool_name: 'Bash', input, tool_use_id: 'same-call' },
    }),
    expect.any(AbortSignal),
  );
  expect(f.write).not.toHaveBeenCalled();
});

it.each([true, 'true', 1, null])(
  'refuses a sandbox override before approval: %j',
  async (dangerouslyDisableSandbox) => {
    const f = fixture();
    const answer = await f.call({ command: 'node harness.js', dangerouslyDisableSandbox });
    expect(answer.behavior).toBe('deny');
    expect(answer.message).toContain('sandbox policy');
    expect(answer.message).not.toContain('user');
    expect(f.approve).not.toHaveBeenCalled();
    expect(f.write).toHaveBeenCalledWith('claude: denied by sandbox policy: Bash: node harness.js');
  },
);

it('preserves path and symlink protections on file tools', async () => {
  const f = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'gdpl-claude-outside-'));
  roots.push(outside);
  symlinkSync(outside, join(f.cwd, 'link'));
  expect((await f.call({ file_path: join(outside, 'new.ts'), content: 'x' }, 'Write')).behavior).toBe('deny');
  expect((await f.call({ file_path: join(f.cwd, 'link', 'new.ts'), content: 'x' }, 'Write')).behavior).toBe('deny');
  expect(f.approve).not.toHaveBeenCalled();
  expect((await f.call({ file_path: join(f.cwd, 'new.ts'), content: 'x' }, 'Write')).behavior).toBe('allow');
  expect(f.approve).toHaveBeenCalledOnce();
});

it('keeps read-only Bash denied and unrestricted overrides available', async () => {
  const read = fixture('read-only');
  expect((await read.call({ command: 'node harness.js' })).behavior).toBe('deny');
  expect(read.approve).not.toHaveBeenCalled();
  const unrestricted = fixture('unrestricted');
  const input = { command: 'node harness.js', dangerouslyDisableSandbox: true };
  expect(await unrestricted.call(input)).toEqual({ behavior: 'allow', updatedInput: input });
});

it('rejects malformed inputs and respects cancellation and handler failure', async () => {
  const f = fixture();
  for (const input of [undefined, null, [], {}, { command: '' }]) expect((await f.call(input)).behavior).toBe('deny');
  expect(f.approve).not.toHaveBeenCalled();
  expect((await f.call({ command: 'node harness.js' }, 'Bash', AbortSignal.abort())).behavior).toBe('deny');
  expect(f.approve).not.toHaveBeenCalled();
  f.approve.mockRejectedValueOnce(new Error('handler failed'));
  expect((await f.call({ command: 'node harness.js' })).behavior).toBe('deny');
});
