import { PassThrough } from 'node:stream';
import { createElement } from 'react';
import { render } from 'ink';
import stripAnsi from 'strip-ansi';
import { afterAll, expect, it, vi } from 'vitest';
import { ReplApp } from './app.js';
import { createTuiSession } from './session.js';

// Exercise interactive redraws even when the test runner is CI.
const originalCI = vi.hoisted(() => {
  const value = process.env.CI;
  process.env.CI = 'false';
  return value;
});
afterAll(() => {
  if (originalCI === undefined) delete process.env.CI;
  else process.env.CI = originalCI;
});

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
    expect(output).toContain(`\u001b]8;;${url}\u0007`);
    for (const line of stripAnsi(output).split('\n')) expect(line.length).toBeLessThanOrEqual(columns);
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

it('preserves wide messages in scrollback on shrink without replaying earlier static messages', async () => {
  const session = createTuiSession('');
  const stdin = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  const stdout = Object.assign(new PassThrough(), { columns: 80, rows: 24, isTTY: true });
  let output = '';
  stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  const app = render(
    createElement(ReplApp, {
      session,
      color: false,
      initialSidebar: true,
      checkout: () => ({ root: '/workspace', slug: 'demo' }),
    }),
    {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      exitOnCtrlC: false,
      patchConsole: false,
    },
  );
  const resize = async (columns: number) => {
    stdout.columns = columns;
    stdout.emit('resize');
    await new Promise((resolve) => setTimeout(resolve, 100));
  };
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    void session.prompt();
    session.writeLine('classic-first');
    await resize(150);
    session.writeLine('wide-first');
    await new Promise((resolve) => setTimeout(resolve, 100));
    output = '';
    await resize(80);
    for (const line of stripAnsi(output).split('\n')) expect(line.length).toBeLessThanOrEqual(80);
    expect(
      stripAnsi(output)
        .split('\n')
        .map((line) => line.trim()),
    ).toContain('wide-first');
    expect(
      stripAnsi(output)
        .split('\n')
        .map((line) => line.trim()),
    ).not.toContain('classic-first');
    await resize(150);
    session.writeLine('wide-second');
    await new Promise((resolve) => setTimeout(resolve, 100));
    output = '';
    await resize(80);
    for (const line of stripAnsi(output).split('\n')) expect(line.length).toBeLessThanOrEqual(80);
    expect(
      stripAnsi(output)
        .split('\n')
        .map((line) => line.trim()),
    ).toContain('wide-second');
    expect(
      stripAnsi(output)
        .split('\n')
        .map((line) => line.trim()),
    ).not.toContain('wide-first');
    expect(
      stripAnsi(output)
        .split('\n')
        .map((line) => line.trim()),
    ).not.toContain('classic-first');
  } finally {
    app.unmount();
    session.close();
    stdin.end();
    stdout.end();
  }
});
