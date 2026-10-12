import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { bufferTerminalInput, frameInput } from './input-frame.js';

afterEach(() => vi.useRealTimers());

it.each(['\u001b[<64;100;5M', '\u001b[M`\u0084%'])('holds incomplete wire reports at every boundary: %s', (report) => {
  for (let split = 1; split < report.length; split++) {
    const framed = frameInput('typed' + report.slice(0, split));
    expect(framed).toEqual({ frames: ['typed'], pending: report.slice(0, split) });
    expect(frameInput(framed.pending + report.slice(split))).toEqual({ frames: [report], pending: '' });
  }
});

it('preserves literal prefixes and frames fragmented keyboard escape sequences too', () => {
  expect(frameInput('[<T>() => T] [MABC')).toEqual({ frames: ['[<T>() => T] [MABC'], pending: '' });
  expect(frameInput('\u001b[5')).toEqual({ frames: [], pending: '\u001b[5' });
  expect(frameInput('\u001b[5~\u001bOB')).toEqual({ frames: ['\u001b[5~', '\u001bOB'], pending: '' });
  expect(frameInput('\u001bO')).toEqual({ frames: [], pending: '\u001bO' });
});

it('preserves frame boundaries when Ink drains a batched read', async () => {
  const source = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  const bridge = bufferTerminalInput(source as unknown as NodeJS.ReadStream);
  bridge.stdin.setEncoding('latin1');
  const frames: string[] = [];
  bridge.stdin.on('readable', () => {
    bridge.stdin.setEncoding('utf8');
    bridge.stdin.setEncoding('latin1');
    let frame: string | null;
    while ((frame = bridge.stdin.read()) !== null) frames.push(frame);
  });
  try {
    source.write('\u001b[<64;10;5M\u001b[B\u001bOB\u001b\u001b[Atext');
    await vi.waitFor(() =>
      expect(frames).toEqual(['\u001b[<64;10;5M', '\u001b[B', '\u001bOB', '\u001b\u001b[A', 'text']),
    );
  } finally {
    bridge.stop();
    source.end();
  }
});

it('releases a standalone Escape and cancels buffered input on a native handoff', async () => {
  vi.useFakeTimers();
  const source = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  source.setEncoding('utf8');
  const bridge = bufferTerminalInput(source as unknown as NodeJS.ReadStream);
  let received = '';
  bridge.stdin.on('data', (chunk) => {
    received += Buffer.from(chunk).toString('latin1');
  });
  try {
    source.write('\u001b');
    await vi.advanceTimersByTimeAsync(99);
    expect(received).toBe('');
    await vi.advanceTimersByTimeAsync(1);
    expect(received).toBe('\u001b');
    source.write('\u001b[');
    await vi.advanceTimersByTimeAsync(1);
    expect(bridge.hasPending()).toBe(true);
    bridge.stop();
    await vi.advanceTimersByTimeAsync(100);
    expect(received).toBe('\u001b');
    expect(bridge.hasPending()).toBe(false);
    expect(source.readableEncoding).toBe('utf8');
  } finally {
    bridge.stop();
    source.end();
  }
});

it('preserves non-ASCII coordinate bytes across the physical input bridge', async () => {
  const source = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  const bridge = bufferTerminalInput(source as unknown as NodeJS.ReadStream);
  const chunks: Buffer[] = [];
  bridge.stdin.on('data', (chunk) => {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'latin1') : Buffer.from(chunk));
  });
  try {
    const report = Buffer.from([0x1b, 0x5b, 0x4d, 0x60, 132, 37]);
    source.write(report.subarray(0, 2));
    source.write(report.subarray(2));
    await vi.waitFor(() => expect(Buffer.concat(chunks)).toEqual(report));
  } finally {
    bridge.stop();
    source.end();
  }
});
