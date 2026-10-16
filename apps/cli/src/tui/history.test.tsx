import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { render } from 'ink';
import { afterAll, expect, it, vi } from 'vitest';
import type { ApiClient } from '../api.js';
import { handleReplLine } from '../repl.js';
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

it('fits slash history to the Ink transcript with the sidebar open, closed and after resize', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gamedev-history-width-'));
  const session = createTuiSession('');
  const stdin = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  const stdout = Object.assign(new PassThrough(), { columns: 120, rows: 35, isTTY: true });
  stdout.resume();
  let columns = 0;
  const app = render(
    createElement(ReplApp, {
      session,
      color: false,
      initialSidebar: true,
      inline: false,
      mouse: false,
      checkout: () => ({ root, slug: 'probe' }),
      onTranscriptWidth: (value) => {
        columns = value;
      },
    }),
    {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      exitOnCtrlC: false,
      patchConsole: false,
    },
  );
  let pendingRead: Promise<void> | undefined;
  const api = {
    request: async () => {
      await pendingRead;
      return {
        versions: [
          {
            version: 'v20261014T083417049Z-597aa5561aa5',
            createdAt: '2026-10-14T08:34:17Z',
            verdict: 'passed',
            summary:
              'History summary with enough words to wrap and retain indentation across multiple visual rows in the transcript.',
          },
        ],
        hasMore: false,
        nextCursor: null,
      };
    },
  } as unknown as ApiClient;
  const log = async (oneline: boolean) => {
    const lines: string[] = [];
    await handleReplLine({
      line: `/log probe${oneline ? ' --oneline' : ''}`,
      api,
      token: null,
      env: { NO_COLOR: '1' },
      cwd: root,
      columns: () => columns,
      write: (text) => {
        lines.push(...text.split('\n'));
        session.writeLine(text);
      },
    });
    expect(lines.every((line) => line.length <= columns)).toBe(true);
    if (oneline) expect(lines).toHaveLength(1);
    else {
      const body = lines.slice(lines.indexOf('') + 1).filter(Boolean);
      expect(body.length).toBeGreaterThan(1);
      expect(body.every((line) => line.startsWith('    '))).toBe(true);
    }
  };
  try {
    await vi.waitFor(() => expect(columns).toBe(73));
    await log(true);
    void session.prompt();
    stdin.write('\u0002');
    await vi.waitFor(() => expect(columns).toBe(113));
    await log(true);
    let release!: () => void;
    pendingRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = log(true);
    stdout.columns = 40;
    stdout.emit('resize');
    await vi.waitFor(() => expect(columns).toBe(33));
    release();
    await pending;
    pendingRead = undefined;
    await log(false);
    await log(true);
  } finally {
    app.unmount();
    session.close();
    stdin.end();
    stdout.end();
    rmSync(root, { recursive: true, force: true });
  }
});
