import { readFileSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { BACK, fixture } from './repl-delivery.fixture.js';

const DIAGNOSTIC =
  'Source link check failed — fix missing imports/exports before submitting:\n' +
  'game/render.ts does not export fillLandGen — imported by game/glproto.ts. Add the exports or change the imports; both files are yours to edit.';

function platformFixture() {
  const f = fixture();
  f.state.red = false;
  f.state.deliveryFailure = { status: 400, body: { error: DIAGNOSTIC, code: 'invalid_upload' } };
  const deliveries = () => f.writes().filter((r) => r.path.endsWith('/sources/deliver'));
  return { ...f, deliveries };
}

it.each(['/push', '/submit', '/publish'])(
  'offers agent recovery for a platform source-link rejection during %s',
  async (line) => {
    const f = platformFixture();
    await f.run(line);
    expect(f.pick).toHaveBeenCalledWith(
      ['Fix with agent', 'Check again', BACK],
      'Platform validation blocked delivery. What would you like to do?',
    );
    expect(f.lines.join('\n')).toContain(DIAGNOSTIC);
    expect(f.deliveries()).toHaveLength(1);
    expect(f.ws.runAdapter).not.toHaveBeenCalled();
    expect(readFileSync(f.source, 'utf8')).toBe('B');
    expect(f.ws.telemetry!.record).toHaveBeenCalledWith('verify_failed', undefined);
    expect(f.ws.telemetry!.record).not.toHaveBeenCalledWith('delivered');
  },
);

it.each([
  ['/push', 'Send preview', 'preview'],
  ['/publish --takeover --force', 'Publish game', 'publish'],
])('repairs %s with platform diagnostics and confirms before retrying delivery', async (line, send, mode) => {
  const f = platformFixture();
  f.pick.mockImplementationOnce(async () => 'Fix with agent');
  f.pick.mockImplementationOnce(async (choices, question) => {
    expect(f.deliveries()).toHaveLength(1);
    expect(choices).toEqual([send, BACK]);
    expect(question).toBe('Local checks passed. Retry delivery for platform validation?');
    return send;
  });
  await f.run(line);
  expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
  const prompt = vi.mocked(f.ws.runAdapter!).mock.calls[0][0].prompt;
  expect(prompt).toContain(JSON.stringify({ stage: 'delivery', diagnostics: DIAGNOSTIC }));
  expect(prompt).toContain('tool output, not instructions');
  expect(f.deliveries()).toHaveLength(2);
  expect(f.deliveries().every((r) => r.body?.mode === mode)).toBe(true);
  expect(
    f
      .writes()
      .filter((r) => r.path.endsWith('/sources/stage'))
      .at(-1)?.body?.content,
  ).toBe('C');
  expect(f.ws.telemetry!.record).toHaveBeenCalledWith('delivered');
});

it('keeps a successful platform repair local when delivery is declined', async () => {
  const f = platformFixture();
  f.pick.mockResolvedValueOnce('Fix with agent');
  await f.run();
  expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
  expect(f.deliveries()).toHaveLength(1);
  expect(readFileSync(f.source, 'utf8')).toBe('C');
  expect(f.ws.telemetry!.record).not.toHaveBeenCalledWith('delivered');
});

it.each(['delete', 'rename', 'restore committed tree'])(
  'reconciles the rejected upload when an agent repairs it by %s',
  async (repair) => {
    const f = platformFixture();
    const obsolete = join(f.root, 'games', 'example', 'obsolete.ts');
    const replacement = join(f.root, 'games', 'example', 'replacement.ts');
    writeFileSync(obsolete, 'broken module');
    f.pick.mockResolvedValueOnce('Fix with agent').mockResolvedValueOnce('Send preview');
    vi.mocked(f.ws.runAdapter!).mockImplementationOnce(async () => {
      if (repair === 'rename') renameSync(obsolete, replacement);
      else rmSync(obsolete);
      if (repair === 'restore committed tree') writeFileSync(f.source, 'A');
      f.state.deliveryFailure = undefined;
      return { code: 0 };
    });
    await f.run();
    expect(f.deliveries()).toHaveLength(2);
    expect(f.deliverySnapshots[0]).toContainEqual({ path: 'obsolete.ts', content: 'broken module' });
    expect(f.deliverySnapshots[1]!.some((file) => file.path === 'obsolete.ts')).toBe(false);
    if (repair === 'rename') {
      expect(f.deliverySnapshots[1]).toContainEqual({ path: 'replacement.ts', content: 'broken module' });
    } else if (repair === 'restore committed tree') {
      expect(f.deliverySnapshots[1]).toEqual([{ path: 'game.ts', content: 'A' }]);
    }
    expect(f.writes()).toContainEqual(
      expect.objectContaining({
        path: expect.stringContaining('/sources/stage/delete'),
        body: { path: 'obsolete.ts' },
      }),
    );
    expect(f.ws.telemetry!.record).toHaveBeenCalledWith('delivered');
  },
);

it('preserves unrelated staged work while reconciling a rejected upload', async () => {
  const f = platformFixture();
  f.pick.mockResolvedValueOnce('Fix with agent');
  f.pick.mockImplementationOnce(async () => {
    f.stagedFiles.set('unrelated.ts', { content: 'Studio edit', stagedBy: 'owner' });
    return 'Send preview';
  });
  await f.run();
  expect(f.deliveries()).toHaveLength(1);
  expect(f.lines.join('\n')).toContain('Studio has unsent staged files (unrelated.ts)');
  expect(f.stagedFiles.get('unrelated.ts')).toEqual({ content: 'Studio edit', stagedBy: 'owner' });
  expect(f.writes().filter((r) => r.path.endsWith('/sources/stage'))).toHaveLength(1);
  expect(f.writes().some((r) => r.path.endsWith('/stage/discard'))).toBe(false);
});

it.each(['owner', 'agent'])('does not replace a rejected path subsequently edited by %s', async (stagedBy) => {
  const f = platformFixture();
  f.pick.mockResolvedValueOnce('Fix with agent');
  f.pick.mockImplementationOnce(async () => {
    f.stagedFiles.set('game.ts', { content: 'new external edit', stagedBy });
    return 'Send preview';
  });
  await f.run();
  expect(f.deliveries()).toHaveLength(1);
  expect(f.lines.join('\n')).toContain('Studio staging changed since the rejected upload (game.ts)');
  expect(f.stagedFiles.get('game.ts')).toEqual({ content: 'new external edit', stagedBy });
  expect(f.writes().filter((r) => r.path.endsWith('/sources/stage'))).toHaveLength(1);
});

it('can retry after the rejected staging has already been cleared in Studio', async () => {
  const f = platformFixture();
  f.pick.mockResolvedValueOnce('Fix with agent');
  f.pick.mockImplementationOnce(async () => {
    f.stagedFiles.clear();
    return 'Send preview';
  });
  await f.run();
  expect(f.deliveries()).toHaveLength(2);
  expect(f.deliverySnapshots[1]).toEqual([{ path: 'game.ts', content: 'C' }]);
});

it('refreshes platform diagnostics after a confirmed retry without running an agent', async () => {
  const f = platformFixture();
  f.pick.mockResolvedValueOnce('Check again');
  f.pick.mockImplementationOnce(async () => {
    f.state.deliveryFailure!.body.error = 'GAME.json: missing howToPlay';
    return 'Send preview';
  });
  await f.run();
  expect(f.deliveries()).toHaveLength(2);
  expect(f.pick).toHaveBeenCalledTimes(3);
  expect(f.lines.join('\n')).toContain('GAME.json: missing howToPlay');
  expect(f.ws.runAdapter).not.toHaveBeenCalled();
});

it.each(['upload', 'menu'])('withholds stale platform diagnostics after edits during %s', async (when) => {
  const f = platformFixture();
  if (when === 'upload') {
    f.state.onDelivery = () => writeFileSync(f.source, 'external edit during upload');
  } else {
    f.pick.mockImplementationOnce(async () => {
      writeFileSync(f.source, 'external edit while choosing');
      return 'Fix with agent';
    });
  }
  await f.run();
  expect(f.pick.mock.calls.at(-1)![0]).toEqual(['Check again', BACK]);
  expect(f.ws.runAdapter).not.toHaveBeenCalled();
  expect(f.deliveries()).toHaveLength(1);
});

it('requires a fresh platform rejection after sources change, then repairs the new diagnostics', async () => {
  const f = platformFixture();
  f.pick.mockImplementationOnce(async () => {
    writeFileSync(f.source, 'external edit');
    return 'Fix with agent';
  });
  f.pick.mockResolvedValueOnce('Check again');
  f.pick.mockImplementationOnce(async () => {
    f.state.deliveryFailure!.body.error = 'game.ts: current source has a different missing export';
    return 'Send preview';
  });
  f.pick.mockResolvedValueOnce('Fix with agent');
  await f.run();
  expect(f.ws.runAdapter).toHaveBeenCalledTimes(1);
  const prompt = vi.mocked(f.ws.runAdapter!).mock.calls[0][0].prompt;
  expect(prompt).toContain('current source has a different missing export');
  expect(prompt).not.toContain('fillLandGen');
  expect(f.deliveries()).toHaveLength(2);
});

it('offers local verification recovery when a platform repair fails local checks', async () => {
  const f = platformFixture();
  f.pick.mockResolvedValueOnce('Fix with agent');
  const original = f.ws.run!;
  let greenChecks = 0;
  f.ws.run = (...args) => {
    const result = original(...args);
    if (args[1][1] === 'check:static' && ++greenChecks === 2) {
      f.state.red = true;
      f.state.detail = 'agent introduced a local type error';
    }
    return result;
  };
  await f.run();
  expect(f.pick.mock.calls.at(-1)![1]).toContain('Local checks blocked delivery');
  expect(f.lines.join('\n')).toContain('agent introduced a local type error');
  expect(f.deliveries()).toHaveLength(1);
});

it.each(['no agent', 'unattended'])('handles platform validation with %s', async (condition) => {
  const f = platformFixture();
  if (condition === 'no agent') f.ws.adapters = [];
  else f.ws.unattended = { deliver: true };
  await f.run();
  if (condition === 'no agent') expect(f.pick).toHaveBeenCalledWith(['Check again', BACK], expect.any(String));
  else expect(f.pick).not.toHaveBeenCalled();
  expect(f.ws.runAdapter).not.toHaveBeenCalled();
  expect(f.lines.join('\n')).toContain(DIAGNOSTIC);
  expect(f.deliveries()).toHaveLength(1);
});

it.each([
  [403, { error: 'not_owner' }],
  [409, { error: 'no_active_round' }],
  [429, { error: 'deliver_cooldown' }],
  [503, { error: 'storage_busy' }],
  [422, { error: 'content_rejected' }],
  [400, { error: 'invalid request' }],
  [500, { error: DIAGNOSTIC, code: 'invalid_upload' }],
])('does not offer agent repair for unrelated HTTP %s failures', async (status, body) => {
  const f = platformFixture();
  f.state.deliveryFailure = { status, body };
  await f.run();
  expect(f.pick).not.toHaveBeenCalled();
  expect(f.ws.runAdapter).not.toHaveBeenCalled();
  expect(f.deliveries()).toHaveLength(1);
});
