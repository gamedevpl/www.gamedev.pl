import { PassThrough } from 'node:stream';
import { createElement } from 'react';
import { render } from 'ink';
import stripAnsi from 'strip-ansi';
import { afterAll, expect, it, vi } from 'vitest';
import { ReplApp } from './app.js';
import { createTuiSession } from './session.js';

const originalCI = vi.hoisted(() => {
  const value = process.env.CI;
  process.env.CI = 'false';
  return value;
});
afterAll(() => {
  if (originalCI === undefined) delete process.env.CI;
  else process.env.CI = originalCI;
});

it.each([40, 120])('pages a diff and restores the draft at terminal width %i', async (columns) => {
  const session = createTuiSession('');
  const stdin = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  const stdout = Object.assign(new PassThrough(), { columns, rows: 24, isTTY: true });
  let output = '';
  stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  const app = render(createElement(ReplApp, { session, color: false }), {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
  try {
    void session.prompt();
    session.setDraft('keep my draft');
    await settle();
    session.writeLine(
      [
        'Diff: platform → local',
        '',
        '--- platform/game.ts',
        '+++ local/game.ts',
        '@@ -1 +1 @@',
        '-const path = `old`;',
        ...Array.from({ length: 60 }, (_, i) => `+const line${i} = ${i};`),
      ].join('\n'),
    );
    await settle();
    expect(stripAnsi(output)).toContain('Diff · platform');
    expect(stripAnsi(output)).toContain('`old`');
    expect(output).not.toContain('\u001b[2J');
    expect(output).not.toContain('\u001b[3J');
    expect(session.get().lines).toHaveLength(1);
    output = '';
    stdin.write('G');
    await settle();
    expect(stripAnsi(output)).toContain('+const line59 = 59;');
    output = '';
    stdin.write('q');
    await vi.waitFor(() => expect(stripAnsi(output)).toContain('keep my draft'), { timeout: 2000 });
    expect(stripAnsi(output)).not.toContain('+const line59');
    output = '';
    stdin.write('\u0004');
    await settle();
    expect(stripAnsi(output)).toContain('Diff · platform');
    expect(session.get().draft).toBe('keep my draft');
  } finally {
    app.unmount();
    session.close();
    stdin.end();
    stdout.end();
  }
});
