import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { PLAY_JOURNAL_RECORDER } from './play-journal-recorder.js';

it('drains large log bursts within the host batch limit, including delimiters', () => {
  const messages: { json: string; recordingId: string }[] = [];
  const listeners = new Map<string, (event: unknown) => void>();
  let flush = () => {};
  const parent = { postMessage: (message: (typeof messages)[number]) => messages.push(message) };
  const context = {
    parent,
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    performance: { now: () => 0 },
    console: { log: (..._args: unknown[]) => {} },
    requestAnimationFrame: () => 0,
    addEventListener: (type: string, callback: (event: unknown) => void) => listeners.set(type, callback),
    document: { addEventListener: () => {} },
    setInterval: (callback: () => void) => {
      flush = callback;
    },
  };
  runInNewContext(PLAY_JOURNAL_RECORDER, { ...context, window: context });
  for (let i = 0; i < 300; i++) context.console.log('x'.repeat(919));
  flush();
  let receivedLogs = 0;
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    expect(message.json.length).toBeLessThanOrEqual(256_000);
    const entries = JSON.parse(message.json) as { seq: number; kind: string }[];
    receivedLogs += entries.filter((entry) => entry.kind === 'console').length;
    listeners.get('message')!({
      source: parent,
      data: {
        source: 'gdpl-journal-host',
        recordingId: message.recordingId,
        through: entries.at(-1)!.seq,
      },
    });
  }
  expect(receivedLogs).toBe(300);
  expect(messages.length).toBeGreaterThan(1);
});
