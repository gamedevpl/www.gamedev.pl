import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { historyStore } from './history.js';
import { runInkRepl } from './host.js';
import { handleReplLine } from '../repl.js';

vi.mock('ink', () => ({ render: () => ({ unmount: vi.fn() }) }));
vi.mock('./app.js', () => ({ ReplApp: () => null }));
vi.mock('../main.js', () => ({ reportInstall: vi.fn() }));
vi.mock('../agents.js', () => ({ discoverAgents: () => [], agentHint: () => '' }));
vi.mock('../telemetry.js', () => ({ createCliTelemetry: () => ({ record: vi.fn(), flush: vi.fn() }) }));
vi.mock('../update-notice.js', () => ({ startUpdateNotice: () => vi.fn() }));
vi.mock('./round-watch.js', () => ({ createRoundWatch: () => ({ poke: vi.fn(), stop: vi.fn() }) }));
vi.mock('../repl.js', () => ({ handleReplLine: vi.fn(), replBanner: () => '' }));
vi.mock('./session.js', async (original) => {
  const actual = await original<typeof import('./session.js')>();
  return {
    ...actual,
    createTuiSession: (...args: Parameters<typeof actual.createTuiSession>) => ({
      ...actual.createTuiSession(...args),
      prompt: async () => 'add ramps',
    }),
  };
});
const homes: string[] = [];
afterEach(() => {
  vi.clearAllMocks();
  homes.splice(0).forEach((home) => rmSync(home, { recursive: true, force: true }));
});

it.each(['/connect second', '/checkout second'])('keeps restored platform conversation after %s', async (command) => {
  const HOME = mkdtempSync(join(tmpdir(), 'gdpl-host-'));
  homes.push(HOME);
  const origin = 'https://history.test';
  const conversationId = '12345678-1234-1234-1234-123456789012';
  const saved = historyStore({ HOME }, origin, 'owner', 'game:second');
  saved.save({ lines: ['old conversation'], prompts: ['old prompt'], conversationId });
  vi.mocked(handleReplLine)
    .mockResolvedValueOnce({ next: 'continue', slug: 'second', conversationId: '' })
    .mockResolvedValueOnce({ next: 'quit' });
  await runInkRepl({
    api: {
      origin,
      request: vi.fn().mockResolvedValue({ user: { uid: 'owner' } }),
      requestBytes: vi.fn(),
    },
    env: { HOME },
    io: { stdin: process.stdin, stdout: process.stdout },
    token: null,
    slug: 'first',
    initialLine: command,
  });
  expect(vi.mocked(handleReplLine).mock.calls[1]![0].conversationId).toBe(conversationId);
  expect(saved.load().conversationId).toBe(conversationId);
});
