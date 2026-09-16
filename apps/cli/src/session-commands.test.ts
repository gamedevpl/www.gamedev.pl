import { describe, expect, it, vi } from 'vitest';
import { createSessionController } from './session-controller.js';
import { createSessionCommands } from './session-commands.js';

describe('shared session commands', () => {
  it('accepts a second client input once and preserves the terminal draft', async () => {
    const session = createSessionController('');
    const dispatch = createSessionCommands(session);
    const pending = session.prompt();
    session.setDraft('unfinished terminal thought');
    const command = { id: 'browser-1', kind: 'input' as const, promptId: session.get().promptId, text: 'add ramps' };
    expect(dispatch(command).status).toBe('accepted');
    expect(dispatch(command).status).toBe('accepted');
    expect(await pending).toBe('add ramps');
    expect(session.savedHistory().prompts).toEqual(['add ramps']);
    const next = session.prompt();
    expect(session.get().draft).toBe('unfinished terminal thought');
    session.close();
    await next;
  });

  it('rejects a stale choice even when the next question has identical choices', async () => {
    const session = createSessionController('');
    const dispatch = createSessionCommands(session);
    const first = session.prompt(['Yes', 'No'], 'Send?');
    const promptId = session.get().promptId;
    session.movePick(1);
    session.submit();
    expect(await first).toBe('No');
    const second = session.prompt(['Yes', 'No'], 'Delete?');
    expect(dispatch({ id: 'stale', kind: 'input', promptId, text: 'Yes' }).status).toBe('stale');
    expect(dispatch({ id: 'other', kind: 'input', promptId: session.get().promptId, text: 'Whatever' }).status).toBe(
      'stale',
    );
    session.close();
    expect(await second).toBe('/quit');
  });

  it('shares one queue without using follow-ups to answer operational prompts', async () => {
    const session = createSessionController('');
    const dispatch = createSessionCommands(session);
    session.setLocalTask('codex');
    session.setDraft('terminal request');
    session.queueDraft();
    const command = { id: 'browser', kind: 'queue' as const, taskId: session.get().taskId, text: 'browser request' };
    expect(dispatch(command).status).toBe('accepted');
    expect(dispatch(command).status).toBe('accepted');
    const choice = session.prompt(['Send', 'Keep']);
    session.movePick(1);
    session.submit();
    expect(await choice).toBe('Keep');
    expect(await session.prompt()).toBe('terminal request');
    expect(await session.prompt()).toBe('browser request');
    session.close();
  });

  it('stops only the observed task and never invokes terminal quit while idle', async () => {
    const cancel = vi.fn();
    const session = createSessionController('', cancel);
    const dispatch = createSessionCommands(session);
    expect(dispatch({ id: 'idle', kind: 'stop', taskId: 0 }).status).toBe('stale');
    session.setLocalTask('codex');
    const oldId = session.get().taskId;
    session.setLocalTask('');
    session.setLocalTask('claude');
    expect(dispatch({ id: 'old', kind: 'stop', taskId: oldId }).status).toBe('stale');
    const taskId = session.get().taskId;
    const command = { id: 'stop', kind: 'stop' as const, taskId };
    expect(dispatch(command).status).toBe('accepted');
    expect(dispatch(command).status).toBe('accepted');
    expect(dispatch({ ...command, id: 'another' }).status).toBe('stale');
    expect(cancel).toHaveBeenCalledOnce();
    session.close();
  });

  it('rejects conflicting IDs and fails closed when receipt storage is full', async () => {
    const session = createSessionController('');
    const dispatch = createSessionCommands(session, 1);
    const pending = session.prompt();
    const command = { id: 'first', kind: 'input' as const, promptId: session.get().promptId, text: 'hello' };
    expect(dispatch(command).status).toBe('accepted');
    expect(dispatch({ ...command, text: 'changed' }).status).toBe('conflict');
    expect(dispatch({ ...command, id: 'new' }).status).toBe('capacity');
    expect(dispatch(command).status).toBe('accepted');
    await pending;
    session.close();
  });

  it('refuses input after closure and does not accept oversized prompts', async () => {
    const session = createSessionController('');
    const dispatch = createSessionCommands(session);
    const pending = session.prompt();
    const promptId = session.get().promptId;
    expect(dispatch({ id: 'large', kind: 'input', promptId, text: 'x'.repeat(8001) }).status).toBe('invalid');
    session.close();
    expect(dispatch({ id: 'closed', kind: 'input', promptId, text: 'hello' }).status).toBe('stale');
    expect(await pending).toBe('/quit');
  });
});

it('does not route browser messages into terminal commands or control escapes', async () => {
  const session = createSessionController('');
  const dispatch = createSessionCommands(session);
  const pending = session.prompt();
  const promptId = session.get().promptId;
  for (const text of ['/push', '  /quit', String.fromCharCode(27) + '[2J']) {
    expect(dispatch({ id: 'unsafe', kind: 'input', promptId, text }).status).toBe('invalid');
  }
  session.close();
  await pending;
});

it('terminal stop rejects subsequent browser follow-ups for the stopping task', () => {
  const session = createSessionController('', vi.fn());
  const dispatch = createSessionCommands(session);
  session.setLocalTask('codex');
  const taskId = session.get().taskId;
  session.cancel();
  expect(dispatch({ id: 'late', kind: 'queue', taskId, text: 'do more' }).status).toBe('stale');
  session.close();
});

it('a failing subscriber cannot strand an accepted input', async () => {
  const session = createSessionController('');
  const dispatch = createSessionCommands(session);
  let fail = false;
  session.subscribe(() => {
    if (fail) throw new Error('disconnected client');
  });
  const pending = session.prompt();
  fail = true;
  expect(dispatch({ id: 'input', kind: 'input', promptId: session.get().promptId, text: 'hello' }).status).toBe(
    'accepted',
  );
  expect(await pending).toBe('hello');
  session.close();
});
