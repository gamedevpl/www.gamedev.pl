import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { historyStore } from './history.js';
import { createTuiSession } from './session.js';
const homes: string[] = [];
function setup() {
  const HOME = mkdtempSync(join(tmpdir(), 'gdpl-history-'));
  homes.push(HOME);
  return { HOME };
}
afterEach(() => homes.splice(0).forEach((home) => rmSync(home, { recursive: true, force: true })));

it('restores transcript and editable prompts into a new session without re-executing them', async () => {
  const env = setup();
  const store = historyStore(env, 'https://one.test', 'owner', 'game:test');
  const first = createTuiSession('banner');
  const pending = first.prompt();
  first.setDraft('add ramps');
  first.submit();
  await pending;
  first.writeLine('codex ▸ Added two ramps');
  store.save({ ...first.savedHistory(), conversationId: '12345678-1234-1234-1234-123456789012' });
  first.close();
  const second = createTuiSession('banner');
  second.restoreHistory(historyStore(env, 'https://one.test', 'owner', 'game:test').load());
  const next = second.prompt();
  second.historyPrev();
  expect(second.get().draft).toBe('add ramps');
  expect(second.get().lines).toContain('codex ▸ Added two ramps');
  expect(second.get().previewUrl).toBe('');
  expect(store.load().conversationId).toBe('12345678-1234-1234-1234-123456789012');
  second.close();
  await next;
});

it('isolates accounts, servers, and games and tolerates corrupt or oversized files', () => {
  const env = setup();
  const store = historyStore(env, 'https://one.test', 'a', 'game:x');
  store.save({ lines: ['hello'], prompts: ['hi'] });
  for (const [origin, uid, scope] of [
    ['https://two.test', 'a', 'game:x'],
    ['https://one.test', 'b', 'game:x'],
    ['https://one.test', 'a', 'game:y'],
  ])
    expect(historyStore(env, origin!, uid!, scope!).load().lines).toEqual([]);
  const dir = join(env.HOME, '.config/gamedevpl/history');
  const file = join(dir, readdirSync(dir)[0]!);
  expect(statSync(file).mode & 0o777).toBe(0o600);
  writeFileSync(file, '{broken');
  expect(store.load().lines).toEqual([]);
  writeFileSync(file, ' '.repeat(512_001));
  expect(store.load().lines).toEqual([]);
});

it('bounds stored history and strips terminal escapes and creator credentials', () => {
  const env = setup();
  const store = historyStore(env, 'origin', 'uid', 'game');
  const creatorKey = Buffer.from('c1.u.creator.1.1234567890.signature').toString('base64url');
  store.save({
    lines: Array(300).fill(`\x1b[31mhello gdpl_pat_secret Authorization: Bearer ${creatorKey}`),
    prompts: Array(70).fill('test'),
  });
  expect(store.load().lines).toHaveLength(200);
  expect(store.load().prompts).toHaveLength(50);
  const dir = join(env.HOME, '.config/gamedevpl/history');
  const raw = readFileSync(join(dir, readdirSync(dir)[0]!), 'utf8');
  expect(raw).not.toContain('gdpl_pat_secret');
  expect(raw).not.toContain(creatorKey);
  expect(store.load().lines.at(-1)).toContain('Authorization: Bearer [redacted]');
  expect(raw).toContain('[redacted]');
});
