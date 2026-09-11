import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, appendFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { approvalJournalReader, museApproval, museJournalPaths, runMuseWithApprovals } from './muse-approval.js';
import { loadAdapters } from './adapters.js';
import { interactiveArgs } from './agy-interactive.js';
import { runLocalBuild, type Workshop } from './workshop.js';
const spec = loadAdapters().adapters.find((row) => row.name === 'muse')!;
const id = '12345678-1234-4234-8234-123456789abc';
const time = new Date('2026-09-11T12:00:00Z');
const started = JSON.stringify({
  stream: { kind: 'session', id },
  recorded_at: time.getTime() * 1000,
  payload_type: 'runtime.command.accepted',
});
const approval = JSON.stringify({ payload_type: 'approval_wait.effect.started', payload: { tool_name: 'bash' } });
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'muse-approval-'));
  roots.push(root);
  const env = { XDG_DATA_HOME: root, HOME: root };
  const path = museJournalPaths(env, { id, time })[0]!;
  await mkdir(dirname(path), { recursive: true });
  return { root, env, path };
}
it('identifies approval wait and runtime approval requests without treating tools as approval', () => {
  expect(museApproval(approval)).toBe(true);
  expect(
    museApproval(
      JSON.stringify({ payload_type: 'runtime.session', payload: { kind: 'approval', event: { kind: 'requested' } } }),
    ),
  ).toBe(true);
  expect(museApproval(started)).toBe(false);
  expect(museApproval('{')).toBe(false);
});
it('tails appended partial lines and skips oversized unrelated records', async () => {
  const { path } = await fixture();
  await writeFile(path, 'x'.repeat(1500000) + '\n' + approval.slice(0, 25));
  const read = approvalJournalReader();
  for (let i = 0; i < 8; i++) expect(await read(path)).toBe(false);
  await appendFile(path, approval.slice(25) + '\n');
  expect(await read(path)).toBe(true);
});
it('stops a silent headless run on journal approval without aborting the parent task', async () => {
  const { env, path } = await fixture();
  const controller = new AbortController();
  const onLine = vi.fn();
  const result = await runMuseWithApprovals(
    { spec, prompt: 'edit', cwd: '/', env, abort: controller.signal, onLine },
    async (input) => {
      input.onLine?.(started);
      await writeFile(path, started + '\n' + approval + '\n');
      return new Promise((resolve) =>
        input.abort!.addEventListener('abort', () => resolve({ code: null }), { once: true }),
      );
    },
  );
  expect(result.permissionSession).toBe(id);
  expect(controller.signal.aborted).toBe(false);
  expect(onLine).toHaveBeenCalledWith(expect.stringContaining('Muse needs your approval'));
});
it('propagates user cancellation without presenting approval recovery', async () => {
  const { env } = await fixture();
  const controller = new AbortController();
  const result = await runMuseWithApprovals(
    { spec, prompt: 'edit', cwd: '/', env, abort: controller.signal },
    async (input) => {
      input.onLine?.(started);
      controller.abort();
      expect(input.abort!.aborted).toBe(true);
      return { code: null };
    },
  );
  expect(result.permissionSession).toBeUndefined();
});
it('keeps ordinary completion and refuses disabled session logging', async () => {
  const { env } = await fixture();
  const input = { spec, prompt: 'edit', cwd: '/', env };
  expect(await runMuseWithApprovals(input, async () => ({ code: 0 }))).toEqual({ code: 0 });
  await expect(
    runMuseWithApprovals({ ...input, spec: { ...spec, headless: [...spec.headless, '--no-session-log'] } }, vi.fn()),
  ).rejects.toThrow('requires session logging');
});
for (const mode of ['resume', 'decline', 'unattended', 'failure'] as const)
  it(`handles Muse approval recovery: ${mode}`, async () => {
    const verify = vi.fn(() => ({ status: 0 }));
    const interactiveRun = vi.fn(async (input) => {
      expect(interactiveArgs(input)).toEqual(['--trust-workspace', '--approval-mode', 'on-request', 'resume', id]);
      return { code: mode === 'failure' ? 1 : 0 };
    });
    const pick = vi.fn(async () => (mode === 'decline' ? 'Keep edits and return' : 'Open Muse interactively'));
    const ws: Workshop = {
      slug: 'game',
      root: '/checkout',
      token: '',
      env: {},
      adapters: [spec],
      builder: 'self',
      abort: { current: null },
      pick,
      interactiveRun,
      run: verify,
      runAdapter: async () => ({ code: null, permissionSession: id }),
      ...(mode === 'unattended' ? { unattended: { deliver: false } } : {}),
    };
    expect(await runLocalBuild({ ws, spec, brief: 'edit', write: () => {} })).toBe(mode === 'resume');
    expect(verify.mock.calls.length > 0).toBe(mode === 'resume');
    expect(interactiveRun).toHaveBeenCalledTimes(mode === 'resume' || mode === 'failure' ? 1 : 0);
    if (mode === 'unattended') expect(pick).not.toHaveBeenCalled();
  });
it('preserves model and restrictive settings when resuming without headless-only flags', () => {
  const args = interactiveArgs({
    spec: {
      ...spec,
      headless: [
        ...spec.headless,
        '--permission-profile',
        'restricted',
        '--approval-mode',
        'untrusted',
        '--disable-write',
        '--sandbox-network=none',
        '--model',
        'chosen',
        '--reasoning-effort',
        'high',
        '--max-model-steps',
        '50',
      ],
    },
    conversation: id,
    cwd: '/',
    env: {},
    prompt: 'edit',
    abort: new AbortController().signal,
  });
  expect(args).toContain('restricted');
  expect(args).toContain('untrusted');
  expect(args).toContain('--disable-write');
  expect(args).toContain('--sandbox-network=none');
  expect(args).toContain('chosen');
  expect(args).not.toContain('--max-model-steps');
  expect(args).not.toContain('--json');
  expect(args).not.toContain('--yolo');
  expect(args).not.toContain('--disable-approval');
});
