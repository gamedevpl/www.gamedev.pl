import { withCheckoutWriter } from './workbench-lock.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workbenchArtifacts } from './workbench-artifacts.js';
import { createSessionController } from './session-controller.js';
import { createSessionCommands } from './session-commands.js';
import { journalApi, type PlayJournal } from './workbench-launch.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import type { ApiClient } from './api.js';
import { checkpointFiles, workbenchLocalAction } from './workbench-checkpoints.js';
import type { Workshop } from './workshop.js';
import { SESSION_BROWSER_PAGE } from './session-browser-page.js';
import { PHONE_PAGE } from './workbench-phone-page.js';
import { WORKBENCH_GAME_BRIDGE } from './workbench-game-bridge.js';
import { Script } from 'node:vm';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
it('stores immutable local evidence under generated names and rejects counterfeit images', () => {
  const store = workbenchArtifacts();
  cleanups.push(store.close);
  const data = {
    name: '../../token.txt',
    mime: 'text/plain',
    purpose: 'reference',
    data: Buffer.from('hello').toString('base64'),
    revision: 'old-build',
    device: 'desktop',
    capturedAt: new Date().toISOString(),
  };
  const artifact = store.add(data);
  expect(artifact).not.toHaveProperty('path');
  const record = store.resolve([artifact.id])[0]!;
  expect(readFileSync(record.path, 'utf8')).toBe('hello');
  expect(record.path).not.toContain('token.txt');
  expect(record.revision).toBe('old-build');
  expect(() => store.add({ ...data, mime: 'image/png' })).toThrow('type');
  expect(() => store.resolve(['not-found'])).toThrow('expired');
  expect(() => store.resolve([artifact.id, artifact.id])).toThrow();
  store.close();
  expect(existsSync(record.path)).toBe(false);
});
it('routes fixed actions once and refuses stale questions or injected arguments', async () => {
  const session = createSessionController(''),
    dispatch = createSessionCommands(session);
  const prompt = session.prompt();
  const command = {
    id: 'action',
    kind: 'action' as const,
    promptId: session.get().promptId,
    action: 'checkout' as const,
    argument: 'racer',
  };
  expect(dispatch(command).status).toBe('accepted');
  expect(dispatch(command).status).toBe('accepted');
  expect(await prompt).toBe('/checkout racer');
  expect(dispatch({ ...command, argument: 'other' }).status).toBe('conflict');
  expect(dispatch({ ...command, id: 'bad', argument: 'racer /quit' }).status).toBe('invalid');
  const question = session.prompt(['Yes', 'No'], 'Deliver?');
  expect(dispatch({ ...command, id: 'wrong', promptId: session.get().promptId }).status).toBe('stale');
  session.close();
  await question;
});
it('keeps attachment retries idempotent and does not use media to answer choices', async () => {
  const session = createSessionController(''),
    resolve = vi.fn(() => '\nEvidence: local-file'),
    dispatch = createSessionCommands(session, 10, resolve);
  const prompt = session.prompt();
  const command = {
    id: 'media',
    kind: 'input' as const,
    promptId: session.get().promptId,
    text: 'Fix this',
    attachments: ['a'],
  };
  expect(dispatch(command).status).toBe('accepted');
  expect(dispatch(command).status).toBe('accepted');
  expect(resolve).toHaveBeenCalledOnce();
  expect(await prompt).toContain('Evidence: local-file');
  expect(dispatch({ ...command, attachments: ['b'] }).status).toBe('conflict');
  const choice = session.prompt(['Yes'], 'Confirm');
  expect(dispatch({ ...command, id: 'choice', promptId: session.get().promptId, text: 'Yes' }).status).toBe('invalid');
  session.close();
  await choice;
});
describe('durable mutation boundary', () => {
  const journal = (): PlayJournal => ({ version: 1, instance: 'test', cwd: '/tmp' });
  it('never replays an unknown create, including after reconstructing the client', async () => {
    const request = vi.fn().mockRejectedValueOnce(Error('Response lost')).mockResolvedValue({ status: 'building' });
    const raw = { origin: 'https://example.test', request, requestBytes: vi.fn() } as ApiClient;
    const state = journal(),
      save = vi.fn(),
      api = journalApi(raw, state, save);
    await expect(api.request('POST', '/api/submissions', { title: 'Race' })).rejects.toThrow('lost');
    const reconnected = journalApi(raw, JSON.parse(JSON.stringify(state)), save);
    await expect(reconnected.request('POST', '/api/submissions', { title: 'Race' })).rejects.toThrow('unknown outcome');
    expect(await reconnected.request('GET', '/status')).toEqual({ status: 'building' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('persists the canonical game receipt before checkout setup and permits known refusals', async () => {
    const refusal = new CliError('rate limited', EXIT_REFUSED);
    refusal.httpStatus = 429;
    const request = vi.fn().mockResolvedValueOnce({ token: 'round', slug: 'race' }).mockRejectedValueOnce(refusal);
    const state = journal(),
      saved: PlayJournal[] = [];
    const api = journalApi({ origin: 'https://example.test', request, requestBytes: vi.fn() }, state, () =>
      saved.push(structuredClone(state)),
    );
    await api.request('POST', '/api/submissions', { title: 'Race' });
    expect(state).toMatchObject({ token: 'round', slug: 'race' });
    await expect(api.request('POST', '/other', {})).rejects.toThrow('rate');
    expect(state.pending).toBeUndefined();
    expect(saved.some((s) => s.pending)).toBe(true);
  });
});
it('source checkpoints preserve binary bytes and keep a recovery tree when restored', async () => {
  const root = mkdtempSync(join(tmpdir(), 'play-checkpoint-test-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const game = join(root, 'games', 'race');
  mkdirSync(game, { recursive: true });
  const bytes = Buffer.from([0, 255, 128, 13, 10]);
  writeFileSync(join(game, 'asset.png'), bytes);
  const ws = {
    root,
    slug: 'race',
    pick: async (choices: string[]) => choices[0],
    abort: { current: null },
  } as Workshop;
  const write = vi.fn();
  await workbenchLocalAction('/checkpoint', ws, write);
  writeFileSync(join(game, 'asset.png'), 'changed');
  await workbenchLocalAction('/restore-checkpoint', ws, write);
  expect(readFileSync(join(game, 'asset.png'))).toEqual(bytes);
  expect(checkpointFiles(game)).toHaveLength(1);
  expect(write.mock.calls.at(-1)?.[0]).toContain('preserved');
});
it('all shipped browser scripts parse as JavaScript', () => {
  for (const page of [SESSION_BROWSER_PAGE, PHONE_PAGE]) {
    const source = page.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(source).toBeTruthy();
    expect(() => new Script(source!)).not.toThrow();
  }
  expect(() => new Script(WORKBENCH_GAME_BRIDGE)).not.toThrow();
});

it('writer transactions reject unrelated concurrent edits and allow nested domain operations', async () => {
  const root = mkdtempSync(join(tmpdir(), 'play-writer-test-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  let release!: () => void;
  const first = withCheckoutWriter(root, async () => {
    await withCheckoutWriter(root, async () => undefined);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await expect(withCheckoutWriter(root, async () => undefined)).rejects.toThrow('owns this checkout');
  release();
  await first;
  await expect(withCheckoutWriter(root, async () => 42)).resolves.toBe(42);
});
