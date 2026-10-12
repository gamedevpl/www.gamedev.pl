import {
  chmodSync,
  closeSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createSessionController } from './session-controller.js';
import { openPlayLog, playOutputText, startPlayOutput } from './play-output.js';
import { createRoundWatch } from './tui/round-watch.js';
import type { ApiClient } from './api.js';

it('shows agent progress, validation, errors and questions once without recording drafts or polling noise', async () => {
  const session = createSessionController('banner');
  const output: string[] = [];
  const stop = startPlayOutput(session, (line) => output.push(line));
  session.setLocalTask('claude');
  session.setActivity('claude · Running a shell command');
  session.setActivity('claude · Running a shell command');
  session.writeLine('claude ▸ Checking wagon physics');
  session.setDraft('Unsent private draft');
  session.enqueueInput('Queued private draft', session.get().taskId);
  session.setLive(['queued (no_agent_yet)']);
  session.setLive(['queued (no_agent_yet)']);
  session.setActivity('Verifying game [2/8]');
  session.writeLine('Validation needs changes: collision check failed');
  session.stopTask(session.get().taskId);
  session.setLocalTask('');
  const question = session.prompt(['Retry', 'Keep edits'], 'How should we continue?');
  session.movePick(1);
  session.setDraft('Another unsent draft');
  session.acceptInput('Keep edits', session.get().promptId);
  await question;
  session.setLocalTask('codex');
  session.writeLine('codex ▸ Fix complete');
  session.setLocalTask('');
  const ready = session.prompt();
  stop();
  stop();
  session.writeLine('After unsubscribe');
  session.close();
  await ready;
  const text = output.join('');
  expect(text).toContain('Agent started: claude');
  expect(text).toContain('claude ▸ Checking wagon physics');
  expect(text.match(/Running a shell command/g)).toHaveLength(1);
  expect(text).not.toContain('no_agent_yet');
  expect(text).toContain('Verifying game [2/8]');
  expect(text).toContain('Validation needs changes: collision check failed');
  expect(text.match(/Answer in Play: How should we continue/g)).toHaveLength(1);
  expect(text).toContain('Agent task ended: claude');
  expect(text).toContain('Agent started: codex');
  expect(text).toContain('Ready for your next request in Play.');
  expect(text.match(/Play session ended/g)).toHaveLength(1);
  expect(text).not.toMatch(/banner|private draft|unsent draft|After unsubscribe/);
  expect(output.every((line) => /^\[\d{4}-\d{2}-\d{2}T/.test(line))).toBe(true);
});

it('keeps polling snapshots in the browser and logs an announced round boundary only once', async () => {
  const session = createSessionController('');
  const output: string[] = [];
  const stop = startPlayOutput(session, (line) => output.push(line));
  const api = {
    origin: 'https://example.test',
    request: vi
      .fn()
      .mockResolvedValueOnce({ status: 'building' })
      .mockResolvedValueOnce({ status: 'building', stall: 'quiet' })
      .mockResolvedValueOnce({ status: 'needs_changes', previewGate: { green: true } }),
    requestBytes: vi.fn(),
  } as ApiClient;
  const watch = createRoundWatch({
    getToken: () => 'test-round',
    api,
    setLive: (live) => session.setLive(live.map((line, index) => (index === 0 ? `Studio: ${line}` : line))),
    announce: session.writeLine,
    onStatus: (status) => {
      if (status.status === 'needs_changes') watch.stop();
    },
    sleep: async () => undefined,
  });
  try {
    await watch.run;
    expect(api.request).toHaveBeenCalledTimes(3);
    expect(session.get().live[0]).toBe('Studio: round finished — Studio is waiting (preview green)');
    const text = output.join('');
    expect(text.match(/round finished — Studio is waiting/g)).toHaveLength(1);
    expect(text).not.toMatch(/Studio: Studio:|building|quiet/);
  } finally {
    watch.stop();
    stop();
    session.close();
  }
});

it('coalesces tool activity over ten seconds while messages, errors and phase changes remain immediate', () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const session = createSessionController('');
  const output: string[] = [];
  const stop = startPlayOutput(session, (line) => output.push(line));
  try {
    session.setLocalTask('claude');
    session.setActivity('claude · Tool: Read');
    vi.advanceTimersByTime(1000);
    session.setActivity('claude · Tool: Edit');
    session.setActivity('claude · Running a shell command');
    session.writeLine('claude ▸ Found the rendering issue');
    session.writeLine('Tool failed: capture');
    expect(output.join('')).toContain('Found the rendering issue');
    expect(output.join('')).toContain('Tool failed: capture');
    expect(output.join('')).not.toContain('Tool: Edit');
    vi.advanceTimersByTime(8999);
    expect(output.join('')).not.toContain('Running a shell command');
    vi.advanceTimersByTime(1);
    expect(output.join('').match(/Running a shell command/g)).toHaveLength(1);
    session.setActivity('claude · Tool: Write');
    session.setActivity('Verifying game [2/8]');
    expect(output.join('')).toContain('Verifying game [2/8]');
    vi.advanceTimersByTime(10_000);
    expect(output.join('')).not.toContain('Tool: Write');
    session.setActivity('claude · Tool: Search');
    session.setActivity('claude · Tool: Read');
    session.setLocalTask('');
    vi.advanceTimersByTime(10_000);
    expect(output.join('').match(/Tool: Read/g)).toHaveLength(1);
  } finally {
    stop();
    session.close();
    vi.useRealTimers();
  }
});

it('cancels deferred tool activity when a question opens or the session ends', async () => {
  vi.useFakeTimers();
  const session = createSessionController('');
  const output: string[] = [];
  const stop = startPlayOutput(session, (line) => output.push(line));
  try {
    session.setLocalTask('codex');
    session.setActivity('codex · Tool: Read');
    session.setActivity('codex · Tool: Edit');
    const question = session.prompt(['Yes', 'No'], 'Deliver?');
    expect(output.join('')).toContain('Answer in Play: Deliver?');
    vi.advanceTimersByTime(10_000);
    expect(output.join('')).not.toContain('Tool: Edit');
    session.acceptInput('No', session.get().promptId);
    await question;
    session.setActivity('codex · Tool: Search');
    session.setActivity('codex · Tool: Write');
    stop();
    vi.advanceTimersByTime(10_000);
    expect(output.join('')).not.toContain('Tool: Write');
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    stop();
    session.close();
    vi.useRealTimers();
  }
});

it('skips restored history while retaining new output and repeated messages from a new task', () => {
  const session = createSessionController('');
  const output: string[] = [];
  const stop = startPlayOutput(session, (line) => output.push(line));
  session.restoreHistory({ lines: ['Old task output'], prompts: ['Old prompt'] });
  session.writeLine('Current task output');
  session.writeLine('Current task output');
  session.writeLine('New heading\nCurrent session:\nNew detail');
  stop();
  expect(output.join('')).not.toContain('Old task output');
  expect(output.join('').match(/Current task output/g)).toHaveLength(2);
  expect(output.join('')).toContain('New heading');
  expect(output.join('')).toContain('New detail');
});

it('removes terminal controls and redacts platform credentials and browser session capabilities', () => {
  const secret = 'a'.repeat(64);
  const raw = `\x1b[2J\x1b]52;c;clipboard\x07\x9bhello gdpl_pat_private-token Authorization: Bearer private-token http://127.0.0.1:1234/#${secret}`;
  const safe = playOutputText(raw);
  expect(safe).toContain('hello [redacted] Authorization: Bearer [redacted] http://127.0.0.1:1234/#[redacted]');
  expect(safe).not.toMatch(/clipboard|private-token/);
  expect([...safe].every((ch) => ch.charCodeAt(0) >= 32 && (ch.charCodeAt(0) < 127 || ch.charCodeAt(0) > 159))).toBe(
    true,
  );
  expect(safe).not.toContain(secret);
  expect(playOutputText('x'.repeat(3000))).toHaveLength(2000);
});

it('creates a private append-only log and refuses symlinks or public files', () => {
  const root = mkdtempSync(join(tmpdir(), 'play-output-'));
  const path = join(root, 'session.log');
  try {
    for (const line of ['first\n', 'second\n']) {
      const fd = openPlayLog(path);
      writeSync(fd, line);
      closeSync(fd);
    }
    expect(readFileSync(path, 'utf8')).toBe('first\nsecond\n');
    if (process.platform !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
      chmodSync(path, 0o644);
      expect(() => openPlayLog(path)).toThrow('owner-only');
      const target = join(root, 'target');
      const link = join(root, 'link');
      writeFileSync(target, 'untouched', { mode: 0o600 });
      symlinkSync(target, link);
      expect(() => openPlayLog(link)).toThrow();
      expect(readFileSync(target, 'utf8')).toBe('untouched');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
