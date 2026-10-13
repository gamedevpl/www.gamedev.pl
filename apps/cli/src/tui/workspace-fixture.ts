import type { WorkspaceCheckout } from './workspace-status.js';
import { PassThrough, Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { createElement } from 'react';
import { render } from 'ink';
import { afterEach, expect, vi } from 'vitest';
import { ReplApp } from './app.js';
import { createTuiSession } from './session.js';
import { bufferTerminalInput } from './input-frame.js';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((close) => close()));
export function screen(
  columns = 150,
  rows = 28,
  historyOffset = 0,
  checkout: () => WorkspaceCheckout | null = () => ({ root: '/workspace', slug: 'demo' }),
  readLogs?: () => string[],
  sidebar = true,
) {
  const session = createTuiSession('');
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  const buffered = bufferTerminalInput(input as unknown as NodeJS.ReadStream);
  const frames: string[] = [];
  const terminal: string[] = [];
  const output = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        terminal.push(String(chunk));
        frames.push(stripVTControlCharacters(String(chunk)));
        done();
      },
    }),
    { columns, rows, isTTY: true },
  );
  const element = () =>
    createElement(ReplApp, { session, color: false, checkout, historyOffset, readLogs, initialSidebar: sidebar });
  const app = render(element(), {
    stdin: buffered.stdin,
    stdout: output as unknown as NodeJS.WriteStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  const settle = () => app.rerender(element());
  settle();
  cleanups.push(() => {
    app.unmount();
    buffered.stop();
    session.close();
    input.end();
    output.end();
  });
  return {
    session,
    frame: () => frames.at(-1) ?? '',
    takeOutput: () => frames.splice(0).join(''),
    terminalOutput: () => terminal.join(''),
    inputEncoding: () => input.readableEncoding,
    close: () => {
      app.unmount();
      buffered.stop();
    },
    async press(keys: string | Buffer, fragmented = false) {
      settle();
      input.write(keys);
      await vi.waitFor(
        () => {
          expect(input.readableLength).toBe(0);
          expect(buffered.stdin.readableLength).toBe(0);
        },
        { interval: 1 },
      );
      if (keys === '\u001b' && !fragmented) {
        await vi.waitFor(() => expect(buffered.hasPending()).toBe(false), { interval: 1 });
      }
      settle();
    },
    resize(width: number, height: number) {
      output.columns = width;
      output.rows = height;
      output.emit('resize');
      settle();
    },
  };
}
