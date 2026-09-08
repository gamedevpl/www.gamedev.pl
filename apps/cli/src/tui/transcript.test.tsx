import { PassThrough } from 'node:stream';
import { createElement } from 'react';
import { render } from 'ink';
import { expect, it } from 'vitest';
import { ReplApp } from './app.js';
import { createTuiSession } from './session.js';

it.each([40, 120])('writes preview hyperlinks once while status animates at width %i', async (columns) => {
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
  try {
    const url = 'http://127.0.0.1:50600/957d84cdc71250b428511a7d2c85639363cbbe3fba57a9cd/';
    session.writeLine(`live preview: ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(output).toContain(`\u001b]8;;${url}\u001b\\`);
    output = '';
    session.setActivity('Muse is editing');
    session.setLive(['queued']);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(output).toContain('Muse is editing');
    expect(output).not.toContain('live preview');
    expect(output).not.toContain(url);
    expect(output).not.toContain('\u001b[2J');
    expect(output).not.toContain('\u001b[3J');
  } finally {
    app.unmount();
    session.close();
    stdin.end();
    stdout.end();
  }
});

it('restores input after a terminal handoff without replaying old transcript lines', async () => {
  const session = createTuiSession('before handoff');
  const raw: boolean[] = [];
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode(value: boolean) {
      raw.push(value);
    },
    ref() {},
    unref() {},
  });
  const stdout = Object.assign(new PassThrough(), { columns: 80, rows: 24, isTTY: true });
  let output = '';
  stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  const options = {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    patchConsole: false,
  };
  let app = render(createElement(ReplApp, { session, color: false }), options);
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    app.unmount();
    expect(raw.at(-1)).toBe(false);
    output = '';
    app = render(createElement(ReplApp, { session, color: false, historyOffset: session.get().lines.length }), options);
    const answer = session.prompt();
    await new Promise((resolve) => setTimeout(resolve, 100));
    stdin.write('hello');
    await new Promise((resolve) => setTimeout(resolve, 100));
    stdin.write('\r');
    expect(await answer).toBe('hello');
    expect(raw.at(-1)).toBe(true);
    expect(output).not.toContain('before handoff');
  } finally {
    app.unmount();
    session.close();
    stdin.end();
    stdout.end();
  }
});
