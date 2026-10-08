import { expect, it, vi } from 'vitest';
import type { LiveSession } from 'genaicode/agents';
import { liveApprovals } from './live-approvals.js';

function fixture(muse: boolean, decision: 'approve' | 'deny' = 'approve') {
  const approve = vi.fn(async () => decision);
  const request = vi.fn(async () => ({ terminal: false }));
  const fail = vi.fn();
  const state = { active: true };
  const session = { approve, rpc: { request } } as unknown as LiveSession;
  return {
    approve,
    request,
    fail,
    state,
    handler: liveApprovals({
      session,
      muse,
      id: () => 's',
      turn: () => 't',
      active: () => state.active,
      fail,
    }),
  };
}
const muse = {
  sessionId: 's',
  turnId: 't',
  approvalId: 'a',
  currentRequirementId: { approvalId: 'a', sourceIndex: 0 },
  subject: { kind: 'shell', command: 'npm test' },
  availableChoices: [
    { choiceId: 'persistent', decision: 'approved', scope: 'session' },
    { choiceId: 'once', decision: 'approved', scope: 'once' },
    { choiceId: 'no', decision: 'denied', scope: 'once' },
  ],
};

it.each(['approve', 'deny'] as const)('answers a Codex command with %s', async (decision) => {
  const f = fixture(false, decision);
  expect(
    await f.handler.request('item/commandExecution/requestApproval', {
      threadId: 's',
      turnId: 't',
      approvalId: 'a',
      command: 'npm test',
      cwd: '/game',
    }),
  ).toEqual({ decision: decision === 'approve' ? 'accept' : 'decline' });
  expect(f.approve).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', kind: 'command' }));
});

it('rejects foreign tasks, unsupported methods and decisions arriving after completion', async () => {
  const f = fixture(false);
  await expect(f.handler.request('item/commandExecution/requestApproval', { threadId: 'other' })).rejects.toThrow();
  await expect(
    f.handler.request('item/commandExecution/requestApproval', { threadId: 's', turnId: 'other' }),
  ).rejects.toThrow();
  await expect(f.handler.request('item/unknown/requestApproval', { threadId: 's' })).rejects.toThrow();
  expect(f.approve).not.toHaveBeenCalled();
  f.approve.mockImplementation(async () => {
    f.state.active = false;
    return 'approve';
  });
  expect(await f.handler.request('item/fileChange/requestApproval', { threadId: 's' })).toEqual({
    decision: 'decline',
  });
});

it('acknowledges Muse requests and decides each requirement once with a server-issued choice', async () => {
  const f = fixture(true);
  expect(await f.handler.request('approval/request', muse)).toEqual({});
  f.handler.notification('approval/requested', muse);
  await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
  expect(f.request).toHaveBeenCalledWith(
    'approval/decide',
    expect.objectContaining({
      sessionId: 's',
      approvalId: 'a',
      choiceId: 'once',
      requirementId: muse.currentRequirementId,
    }),
    30_000,
  );
  f.handler.notification('approval/updated', {
    sessionId: 's',
    approvalId: 'a',
    currentRequirementId: { approvalId: 'a', sourceIndex: 1 },
    availableChoices: muse.availableChoices,
  });
  await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2));
  expect(f.approve).toHaveBeenCalledTimes(2);
});

it('does not turn a one-time Muse approval into a persistent grant', async () => {
  const f = fixture(true);
  await f.handler.request('approval/request', {
    ...muse,
    availableChoices: muse.availableChoices.filter((c) => c.choiceId !== 'once'),
  });
  await vi.waitFor(() => expect(f.request).toHaveBeenCalled());
  expect(f.request.mock.calls[0]).toEqual(['approval/decide', expect.objectContaining({ choiceId: 'no' }), 30_000]);
});

it('fails promptly on malformed Muse requests', async () => {
  const f = fixture(true);
  await f.handler.request('approval/request', { sessionId: 's', approvalId: 'a' });
  await vi.waitFor(() => expect(f.fail).toHaveBeenCalled());
  expect(f.approve).not.toHaveBeenCalled();
});

const permissions = { network: { enabled: true }, fileSystem: { read: null, write: ['/outside/game'] } };
const permissionRequest = { threadId: 's', turnId: 't', itemId: 'p', permissions };

it.each(['approve', 'deny'] as const)('answers Codex permission profiles with %s and turn scope', async (decision) => {
  const f = fixture(false, decision);
  expect(await f.handler.request('item/permissions/requestApproval', permissionRequest)).toEqual({
    permissions: decision === 'approve' ? permissions : {},
    scope: 'turn',
  });
  expect(f.approve).toHaveBeenCalledWith({ id: 'p', kind: 'other', scope: 'turn', detail: permissionRequest });
});

it('omits null permission categories from the grant', async () => {
  const f = fixture(false);
  expect(
    await f.handler.request('item/permissions/requestApproval', {
      ...permissionRequest,
      permissions: { network: null, fileSystem: permissions.fileSystem },
    }),
  ).toEqual({ permissions: { fileSystem: permissions.fileSystem }, scope: 'turn' });
});

it('does not grant permissions after the task ends', async () => {
  const f = fixture(false);
  f.approve.mockImplementation(async () => {
    f.state.active = false;
    return 'approve';
  });
  expect(await f.handler.request('item/permissions/requestApproval', permissionRequest)).toEqual({
    permissions: {},
    scope: 'turn',
  });
});

it.each([
  { ...permissionRequest, threadId: 'other' },
  { ...permissionRequest, turnId: 'other' },
  { ...permissionRequest, turnId: undefined },
  { ...permissionRequest, permissions: null },
  { ...permissionRequest, permissions: { network: true } },
  { ...permissionRequest, permissions: { unknownGrant: true } },
])('rejects invalid or foreign permission requests before prompting', async (request) => {
  const f = fixture(false);
  await expect(f.handler.request('item/permissions/requestApproval', request)).rejects.toThrow();
  expect(f.approve).not.toHaveBeenCalled();
});
